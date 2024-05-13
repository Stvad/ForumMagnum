/* eslint-disable no-console */
import { format as sqlFormatter } from 'sql-formatter';
import { Vulcan } from "../vulcan-lib";
import { getAllCollections, isValidCollectionName } from "../../lib/vulcan-lib/getCollection";
import Table from "../../lib/sql/Table";
import CreateTableQuery from "../../lib/sql/CreateTableQuery";
import md5 from 'md5';
import { unlink, writeFile } from 'node:fs/promises'
import path from 'path';
import { exec } from 'child_process';
import { acceptMigrations, migrationsPath } from './acceptMigrations';
import { existsSync } from 'node:fs';
import { ForumTypeString } from '../../lib/instanceSettings';
import { PostgresFunction, postgresFunctions } from '../postgresFunctions';
import { PostgresExtension, postgresExtensions } from '../postgresExtensions';
import CreateExtensionQuery from '../../lib/sql/CreateExtensionQuery';
import CreateIndexQuery from '../../lib/sql/CreateIndexQuery';
import { sqlInterpolateArgs } from '../../lib/sql/Type';
import { CustomPgIndex, expectedCustomPgIndexes } from '../../lib/collectionIndexUtils';
import { PostgresView, getAllPostgresViews } from '../postgresView';
import TableIndex from '../../lib/sql/TableIndex';

const ROOT_PATH = path.join(__dirname, "../../../");
const acceptedSchemePath = (rootPath: string) => path.join(rootPath, "schema/accepted_schema.sql");
const schemaToAcceptPath = (rootPath: string) => path.join(rootPath, "schema/schema_to_accept.sql");

const migrationTemplateHeader = `/**
 * Generated on %TIMESTAMP% by \`yarn makemigrations\`
 * The following schema changes were detected:
 * -------------------------------------------
`

const migrationTemplateFooter = `
 * -------------------------------------------
 * (run \`git diff --no-index schema/accepted_schema.sql schema/schema_to_accept.sql\` to see this more clearly)
 *
 * - [ ] Write a migration to represent these changes
 * - [ ] Rename this file to something more readable
 * - [ ] Uncomment \`acceptsSchemaHash\` below
 * - [ ] Run \`yarn acceptmigrations\` to update the accepted schema hash (running makemigrations again will also do this)
 */
// export const acceptsSchemaHash = "%HASH%";

export const up = async ({db}: MigrationContext) => {
  // TODO
}

export const down = async ({db}: MigrationContext) => {
  // TODO, not required
}
`

const schemaFileHeaderTemplate = `-- GENERATED FILE
-- Do not edit this file directly. Instead, start a server and run "yarn makemigrations"
-- as described in the README. This file should nevertheless be checked in to version control.
--
`

/**
 * - Generate a hash from the raw SQL
 * - Add a semi-colon if missing
 * - Remove CONCURRENTLY from the query, so the entire accepted_schema.sql file can be applied in a transaction
 */
const hashAndSanitizeIndex = (indexSql: string) => {
  let indexSanitizedSql = indexSql.trim();
  if (!indexSanitizedSql.endsWith(';')) {
    indexSanitizedSql += ';';
  }
  const indexHash = md5(indexSanitizedSql);
  indexSanitizedSql = indexSanitizedSql.replace(/CONCURRENTLY/g, ' ');
  return { indexHash, indexSanitizedSql };
}

declare global {
  type SchemaDependency =
    {type: "extension", name: PostgresExtension} |
    {type: "collection", name: CollectionNameString} |
    {type: "function", name: string} |
    {type: "view", name: string};
}

abstract class Node {
  public dependencies: SchemaDependency[] = [];

  addDependency(dependency: SchemaDependency) {
    this.dependencies.push(dependency);
  }

  abstract getName(): string;
  abstract getQuery(): {compile(): {sql: string, args: any[]}};

  getHeader(): string {
    const type = this.constructor.name.replace(/(_|Node)/g, "");
    return `-- ${type} "${this.getName()}", hash ${this.getHash()}`;
  }

  getSource(): string {
    const {sql, args} = this.getQuery().compile();
    return sqlInterpolateArgs(sql, args).trim();
  }

  getAnnotatedSource(): string {
    const source = this.getSource();
    const hasSemi = source[source.length - 1] === ";";
    return `${this.getHeader()}\n${source}${hasSemi ? "" : ";"}\n`;
  }

  getHash(): string {
    return md5(this.getSource());
  }
}

class ExtensionNode extends Node {
  constructor(private extension: PostgresExtension) {
    super();
  }

  getName() {
    return this.extension;
  }

  getQuery() {
    return new CreateExtensionQuery(this.extension);
  }
}

class TableNode extends Node {
  constructor(private table: Table<DbObject>) {
    super();
  }

  getName() {
    return this.table.getName();
  }

  getQuery() {
    return new CreateTableQuery(this.table);
  }
}

class IndexNode extends Node {
  constructor(
    private table: Table<DbObject>,
    private index: TableIndex<DbObject>,
  ) {
    super();
    this.addDependency({
      type: "collection",
      name: table.getName() as CollectionNameString,
    });
  }

  getName() {
    return this.index.getName();
  }

  getQuery() {
    return new CreateIndexQuery(this.table, this.index, true, false);
  }
}

class CustomIndexNode extends Node {
  private static nameRegex = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)/i;
  private static targetRegex = /.*ON\s+(public\.)?"([A-Za-z0-9_]+)"/i;
  private static concurrentRegex = /\s+CONCURRENTLY\s+/gi;

  private name: string;

  constructor(private index: CustomPgIndex) {
    super();
    const {source, options} = index;
    const name = source.match(CustomIndexNode.nameRegex)?.[4];
    if (!name) {
      throw new Error(`Can't parse name for custom index: ${source}`);
    }
    this.name = name;

    const target = source.match(CustomIndexNode.targetRegex)?.[2];
    if (!target) {
      throw new Error(`Can't parse target for custom index "${name}"`);
    }
    const dependency: SchemaDependency = isValidCollectionName(target)
      ? {type: "collection", name: target}
      : {type: "view", name: target};
    this.addDependency(dependency);

    this.dependencies = this.dependencies.concat(options?.dependencies ?? []);
  }

  getName() {
    return this.name;
  }

  getQuery() {
    return {
      compile: () => ({
        sql: this.index.source.trim().replace(CustomIndexNode.concurrentRegex, " "),
        args: [],
      }),
    };
  }
}

class FunctionNode extends Node {
  private static nameRegex = /^\s*CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_]+)/i;

  private name: string;

  constructor(private func: PostgresFunction) {
    super();
    const name = func.source.match(FunctionNode.nameRegex)?.[2];
    if (!name) {
      throw new Error(`Can't find name for function: ${func.source}`);
    }
    const overload = func.overload ? `_${func.overload}` : "";
    this.name = name + overload;
    this.dependencies = this.dependencies.concat(func.dependencies ?? []);
  }

  getName() {
    return this.name;
  }

  getQuery() {
    return {
      compile: () => ({
        sql: this.func.source.trim(),
        args: [],
      }),
    };
  }
}

class ViewNode extends Node {
  constructor(private view: PostgresView) {
    super();
  }

  getName() {
    return this.view.getName();
  }

  getQuery() {
    return {
      compile: () => ({
        sql: this.view.getCreateViewQuery().trim(),
        args: [],
      }),
    };
  }
}

class Graph {
  private nodes: Record<string, Node> = {};

  addNode(node: Node) {
    const name = node.getName();
    if (this.nodes[name]) {
      throw new Error(`Duplicate node names: "${name}"`);
    }
    this.nodes[name] = node;
  }

  addNodes(nodes: Node[]) {
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  getOverallHash() {
    return md5(Object.values(this.nodes).map((n) => n.getHash()).sort().join());
  }

  linearize(): Node[] {
    const stack: Node[] = [];
    const unvisited = new Set<string>(Object.keys(this.nodes));

    const depthFirstSearch = (nodeName: string, parents: string[]) => {
      if (parents.includes(nodeName)) {
        throw new Error(`Dependency cycle detected for ${nodeName} via ${parents}`);
      }

      const node = this.nodes[nodeName];
      if (!node) {
        throw new Error(`Invalid node: "${nodeName}"`);
      }

      if (!unvisited.has(nodeName)) {
        return;
      }
      unvisited.delete(nodeName);

      for (const dependency of node.dependencies) {
        depthFirstSearch(dependency.name, [...parents, nodeName]);
      }

      stack.push(node);
    }

    unvisited.forEach((node) => depthFirstSearch(node, []));

    return stack;
  }
}

const generateMigration = async ({
  acceptedSchemaFile, toAcceptSchemaFile, toAcceptHash, rootPath,
}: {
  acceptedSchemaFile: string,
  toAcceptSchemaFile: string,
  toAcceptHash: string,
  rootPath: string,
}) => {
  const execRun = (cmd: string) => {
    return new Promise((resolve) => {
      // git diff exits with an error code if there are differences, ignore that and just always return stdout
      exec(cmd, (_error, stdout, _stderr) => resolve(stdout))
    })
  }

  // bit of a hack but using `git diff` for everything makes the changes easy to read
  const diff: string = await execRun(`git diff --no-index ${acceptedSchemaFile} ${toAcceptSchemaFile} --unified=1`) as string;
  const paddedDiff = diff.replace(/^/gm, ' * ');

  let contents = "";
  contents += migrationTemplateHeader.replace("%TIMESTAMP%", new Date().toISOString());
  contents += paddedDiff.length < 30000 ? paddedDiff : ` * ***Diff too large to display***`;
  contents += migrationTemplateFooter.replace("%HASH%", toAcceptHash);

  const fileTimestamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0];
  const fileName = `${fileTimestamp}.auto.ts`;

  await writeFile(path.join(migrationsPath(rootPath), fileName), contents);
}

/**
 * Update the `./schema/` files to match the current database schema, and generate a migration if there are changes which need to be accepted.
 *
 * Implementation details which may be useful to know:
 * This function (and `acceptMigrations`) generates a hash of the current schema (as defined in code) and uses it to maintain three files
 * in the `./schema` directory, `schema_changelog.json`, `accepted_schema.sql`, `schema_to_accept.sql`:
 * - `schema_changelog.json`: This is the file that actually determines whether the current schema is "accepted" or not.
 *   It contains a list of hashes of schema files that have been accepted. If the current schema hash is the most recent entry in this file, then the schema is accepted.
 * - `accepted_schema.sql`: This is a SQL view of the schema that has been accepted.
 * - `schema_to_accept.sql`: If the current schema is not accepted, this file will be generated to contain a SQL view of the "unaccepted" schema.
 *   This is useful for comparing against the accepted schema to see what changes need to be made in the migration that is generated. It is automatically deleted when the schema is accepted.
 */
export const makeMigrations = async ({
  writeSchemaChangelog=true,
  writeAcceptedSchema=true,
  generateMigrations=true,
  rootPath=ROOT_PATH,
  forumType,
  silent=false,
}: {
  /** If true, update the schema_changelog.json file before checking for changes */
  writeSchemaChangelog: boolean,
  /** If true, update the `accepted_schema.sql` and `schema_to_accept.sql` */
  writeAcceptedSchema: boolean,
  /** If true, generate a template migration file if the schema has changed */
  generateMigrations: boolean,
  /** The root path of the project, this is annoying but required because this script is sometimes run from the server bundle, and sometimes from a test. */
  rootPath: string,
  /** The optional forumType to switch to */
  forumType?: ForumTypeString,
  silent?: boolean,
}) => {
  const log = silent ? (..._args: any[]) => {} : console.log;
  log(`=== Checking for schema changes ===`);
  // Get the most recent accepted schema hash from `schema_changelog.json`
  const {acceptsSchemaHash: acceptedHash, acceptedByMigration, timestamp} = await acceptMigrations({write: writeSchemaChangelog, rootPath});
  log(`-- Using accepted hash ${acceptedHash}`);

  const graph = new Graph();
  graph.addNodes(postgresExtensions.map((e) => new ExtensionNode(e)));
  graph.addNodes(getAllCollections().flatMap((collection) => {
    const table = Table.fromCollection(collection, forumType);
    const indexes: Node[] = table.getIndexes().map((i) => new IndexNode(table, i));
    return indexes.concat(new TableNode(table));
  }));
  graph.addNodes(expectedCustomPgIndexes.map((i) => new CustomIndexNode(i)));
  graph.addNodes(postgresFunctions.map((f) => new FunctionNode(f)));
  graph.addNodes(getAllPostgresViews().flatMap((view) => {
    const indexQueries = view.getCreateIndexQueries();
    const indexes: Node[] = indexQueries.map((source) => new CustomIndexNode({source}));
    return indexes.concat(new ViewNode(view));
  }));

  const nodes = graph.linearize();
  const rawSchema = nodes.map((n) => n.getAnnotatedSource()).join("\n");
  const schemaFileContents = sqlFormatter(rawSchema, {
    language: "postgresql",
    linesBetweenQueries: 1,
    tabWidth: 2,
    useTabs: false,
    keywordCase: "upper",
    dataTypeCase: "upper",
    functionCase: "upper",
    identifierCase: "preserve",
    logicalOperatorNewline: "after",
    paramTypes: {
      positional: false,
      numbered: [],
      named: [],
      quoted: [],
      custom: [],
    },
  }) + "\n";

  const overallHash = graph.getOverallHash();

  let schemaFileHeader = schemaFileHeaderTemplate + `-- Overall schema hash: ${overallHash}\n\n`;

  const toAcceptSchemaFile = schemaToAcceptPath(rootPath);
  const acceptedSchemaFile = acceptedSchemePath(rootPath);

  if (overallHash !== acceptedHash) {
    if (writeAcceptedSchema) {
      await writeFile(toAcceptSchemaFile, schemaFileHeader + schemaFileContents);
    }
    if (generateMigrations) {
      await generateMigration({acceptedSchemaFile, toAcceptSchemaFile, toAcceptHash: overallHash, rootPath});
    }
    throw new Error(`Schema has changed, write a migration to accept the new hash: ${overallHash}`);
  }

  if (writeAcceptedSchema) {
    schemaFileHeader += `-- Accepted on ${timestamp}${acceptedByMigration ? " by " + acceptedByMigration : ''}\n\n`;
    await writeFile(acceptedSchemaFile, schemaFileHeader + schemaFileContents);
    if (existsSync(toAcceptSchemaFile)) {
      await unlink(toAcceptSchemaFile);
    }
  }

  log("=== Done ===");
}

Vulcan.makeMigrations = makeMigrations;
