import { getCollectionName, isValidCollectionName } from '../../lib/vulcan-lib';
import { simplSchemaToGraphQLtype } from '../../lib/utils/schemaUtils';
import GraphQLJSON from 'graphql-type-json';
import SimpleSchema from 'simpl-schema'

export const generatedFileHeader = `//
// GENERATED FILE
// Do not edit this file directly. Instead, start a server and run "npm run generate",
// which will cause this file to be regenerated. This file should nevertheless be
// checked in to version control.
`

export const assert = (b: boolean, message?: string) => {
  if(!b) {
    throw new Error(message || "Assertion failed");
  }
}

function maybeNullable(type: string, nullable: boolean) {
  return nullable ? `${type} | null` : type 
}

export function simplSchemaTypeToTypescript(
  schema: SchemaType<CollectionNameString>,
  fieldName: string,
  simplSchemaType: AnyBecauseTodo,
  indent = 2,
): string {
  const nullable = !!schema[fieldName]?.nullable;
  if (simplSchemaType.singleType == Array) {
    const elementFieldName = `${fieldName}.$`;
    if (!(elementFieldName in schema)) {
      throw new Error(`Field ${fieldName} has an array type but ${fieldName}.$ is not in the schema`);
    }

    const typescriptStrElementType = simplSchemaTypeToTypescript(schema, elementFieldName, schema[elementFieldName].type);
    return maybeNullable(`Array<${typescriptStrElementType}>`, nullable);
  } else if (simplSchemaType.singleType) {
    const allowedValues = simplSchemaType.definitions[0]?.allowedValues;

    if (simplSchemaType.singleType == String) {
      if (allowedValues) {
        const unionType = simplSchemaUnionTypeToTypescript(allowedValues);
        return maybeNullable(unionType, nullable);
      }
      return maybeNullable("string", nullable);
    }
    else if (simplSchemaType.singleType == Boolean) return maybeNullable("boolean", nullable);
    else if (simplSchemaType.singleType == Number) return maybeNullable("number", nullable);
    else if (simplSchemaType.singleType == Date) return maybeNullable("Date", nullable);
    else if (simplSchemaType.singleType == SimpleSchema.Integer) return maybeNullable("number", nullable);
    
    const graphQLtype = simplSchemaToGraphQLtype(simplSchemaType.singleType);
    if (graphQLtype) {
      return graphqlTypeToTypescript(graphQLtype);
    } else {
      const innerSchema = simplSchemaType?.singleType?.schema?.();
      if (innerSchema) {
        const objectSchema = simplSchemaObjectTypeToTypescript(innerSchema, indent);
        return maybeNullable(objectSchema, nullable);
      }
      return `any /*${JSON.stringify(simplSchemaType)}*/`
    }
  } else {
    return "any";
  }
}

function simplSchemaUnionTypeToTypescript(allowedValues: string[]) {
  return allowedValues.map(allowedValue => `"${allowedValue}"`).join(" | ");
}

function simplSchemaObjectTypeToTypescript(innerSchema: AnyBecauseTodo, indent: number) {
  const indentSpaces = Array(indent + 2).fill(' ').join('');
  const fields = Object.keys(innerSchema)
    .filter((innerSchemaField) => !innerSchemaField.includes(".$")) // filter out array type definitions
    .map((innerSchemaField) => {
      const fieldTypeDef = simplSchemaTypeToTypescript(
        innerSchema,
        innerSchemaField,
        innerSchema[innerSchemaField].type,
        indent + 2
      );
      return `\n${indentSpaces}${innerSchemaField}: ${fieldTypeDef},`;
    })
    .join("");
  return `{${fields}\n${indentSpaces.slice(0, indentSpaces.length - 2)}}`;
}

export function graphqlTypeToTypescript(graphqlType: any, nonnull?: boolean): string {
  if (!graphqlType) throw new Error("Type cannot be undefined");
  if (graphqlType == GraphQLJSON) return "any";
  
  if (graphqlType.endsWith("!")) {
    return graphqlTypeToTypescript(graphqlType.substr(0, graphqlType.length-1), true);
  }
  
  if (graphqlType.startsWith("[") && graphqlType.endsWith("]")) {
    const arrayElementType = graphqlType.substr(1,graphqlType.length-2);
    return `Array<${graphqlTypeToTypescript(arrayElementType, false)}>`;
  }
  
  switch(graphqlType) {
    case "Int": return "number";
    case "Boolean": return "boolean";
    case "String": return "string";
    case "Date": return "Date";
    case "Float": return "number";
    default:
      if (typeof graphqlType=="string") {
        if (graphqlType.endsWith("!") && isValidCollectionName(getCollectionName(graphqlType.substr(0, graphqlType.length-1)))) {
          return graphqlType;
        } else if (isValidCollectionName(getCollectionName(graphqlType))) {
          if (nonnull) return graphqlType;
          else return `${graphqlType}|null`;
        }
      }
      
      if (graphqlType.collectionName) {
        return graphqlType.collectionName;
      } else {
        // TODO
        //throw new Error("Unrecognized type: "+graphqlType);
        return `any /*${graphqlType}*/`;
      }
  }
}
