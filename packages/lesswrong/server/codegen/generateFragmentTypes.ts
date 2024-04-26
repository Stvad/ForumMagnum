import { getAllFragmentNames, getFragment, getCollectionName, getCollection, getAllCollections, isValidCollectionName } from '../../lib/vulcan-lib';
import { generatedFileHeader, assert, simplSchemaTypeToTypescript, graphqlTypeToTypescript } from './typeGenerationUtils';
import { getSchema } from '../../lib/utils/getSchema';
import groupBy from 'lodash/groupBy';

const fragmentFileHeader = generatedFileHeader+`//
// Contains Typescript signatures for fragments, generated by
// server/codegen/generateFragmentTypes.ts.
//
`

export function generateFragmentTypes(): string {
  const fragmentNames: Array<FragmentName> = getAllFragmentNames();  
  const sb: Array<string> = [];
  
  for (let fragmentName of fragmentNames) {
    sb.push(generateFragmentTypeDefinition(fragmentName));
  }
  
  sb.push(generateFragmentsIndexType());
  sb.push(generateCollectionNamesByFragmentNameType());
  sb.push(generateCollectionNamesIndexType());
  sb.push(generateCollectionNamesWithCreatedAtIndexType());
  sb.push(generateCollectionNamesWithSlugIndexType());
  
  return fragmentFileHeader + sb.join('');
}

type ParsedFragmentType = ReturnType<typeof getParsedFragment>;

function getParsedFragment(fragmentName: FragmentName) {
  const fragmentDefinitions = getFragment(fragmentName);
  
  // `getFragment` returns the parsed definition of a fragment plus all of its
  // dependency fragments. The one we requested will be first.
  assert((fragmentDefinitions?.definitions?.length ?? 0) > 0);
  const parsedFragment = fragmentDefinitions?.definitions[0];
  assert(parsedFragment?.kind === "FragmentDefinition");
  if (!parsedFragment || !("name" in parsedFragment) || !("selectionSet" in parsedFragment) || parsedFragment?.name?.value !== fragmentName) {
    throw new Error("Retrieved parsed fragment with wrong name");
  }
  return parsedFragment;
}

function fragmentNameToCollectionName(fragmentName: FragmentName): CollectionNameString {
  const parsedFragment = getParsedFragment(fragmentName);
  if (!parsedFragment || !("typeCondition" in parsedFragment)) {
    throw new Error("Not a type node");
  }
  const typeName = parsedFragment.typeCondition.name?.value;
  const collectionName = getCollectionName(typeName!);
  return collectionName;
}

function generateFragmentTypeDefinition(fragmentName: FragmentName): string {
  const parsedFragment = getParsedFragment(fragmentName);
  const collectionName = fragmentNameToCollectionName(fragmentName);
  const collection = isValidCollectionName(collectionName) ? getCollection(collectionName) : null;
  
  return fragmentToInterface(fragmentName, parsedFragment, collection);
}

function generateFragmentsIndexType(): string {
  const fragmentNames: Array<FragmentName> = getAllFragmentNames();
  const sb: Array<string> = [];
  
  sb.push('interface FragmentTypes {\n');
  for (let fragmentName of fragmentNames) {
    sb.push(`  ${fragmentName}: ${fragmentName}\n`);
  }
  sb.push('}\n\n');
  
  const fragmentNamesByCollection = groupBy(fragmentNames, (f: FragmentName): CollectionNameString => fragmentNameToCollectionName(f));
  sb.push(`interface FragmentTypesByCollection {\n`);
  for (const collectionName of Object.keys(fragmentNamesByCollection)) {
    sb.push(`  ${collectionName}: `);
    sb.push(fragmentNamesByCollection[collectionName].map(f=>`"${f}"`).join("|"));
    sb.push("\n");
  }
  sb.push('}\n\n');
  
  return sb.join('');
}

function generateCollectionNamesByFragmentNameType(): string {
  const fragmentNames: Array<FragmentName> = getAllFragmentNames();
  const sb: Array<string> = [];
  
  sb.push(`interface CollectionNamesByFragmentName {\n`);
  for (let fragmentName of fragmentNames) {
    const collectionName = fragmentNameToCollectionName(fragmentName);
    sb.push(`  ${fragmentName}: "${collectionName}"\n`);
  }
  sb.push('}\n\n');
  
  return sb.join('');
}

const generateCollectionNameList = (
  name: string,
  collections: CollectionBase<CollectionNameString>[],
): string =>
  `type ${name} = ${collections.map(c => `"${c.collectionName}"`).join('|')}\n\n`;

const generateCollectionNamesIndexType = () =>
  generateCollectionNameList("CollectionNameString", getAllCollections());

const generateCollectionNamesWithCreatedAtIndexType = () =>
  generateCollectionNameList(
    "CollectionNameWithCreatedAt",
    getAllCollections().filter((c) => !!c._schemaFields.createdAt),
  );

const generateCollectionNamesWithSlugIndexType = () =>
  generateCollectionNameList(
    "CollectionNameWithSlug",
    getAllCollections().filter((c) => !!c._schemaFields.slug),
  );

function fragmentToInterface(interfaceName: string, parsedFragment: ParsedFragmentType, collection: AnyBecauseTodo): string {
  const sb: Array<string> = [];
  
  const spreadFragments = getSpreadFragments(parsedFragment);
  const inheritanceStr = spreadFragments.length>0 ? ` extends ${spreadFragments.join(', ')}` : "";
  
  sb.push(`interface ${interfaceName}${inheritanceStr} { // fragment on ${collection?.collectionName ?? "non-collection type"}\n`);
  
  const allSubfragments: Array<string> = [];
  for (let selection of parsedFragment.selectionSet.selections) {
    switch(selection.kind) {
      case "Field":
        const { fieldType, subfragment } = getFragmentFieldType(interfaceName, selection, collection)
        sb.push(`  readonly ${selection.name.value}: ${fieldType},\n`);
        if (subfragment)
          allSubfragments.push(subfragment);
        break;
      case "FragmentSpread":
        break;
      default:
        sb.push(`  UNRECOGNIZED: ${selection.kind}\n`);
        break;
    }
  }
  
  sb.push('}\n\n');
  for (let subfragment of allSubfragments)
    sb.push(subfragment);
  return sb.join('');
}

function getSpreadFragments(parsedFragment: AnyBecauseTodo): Array<string> {
  const spreadFragmentNames: Array<string> = [];
  for (let selection of parsedFragment.selectionSet.selections) {
    if(selection.kind === "FragmentSpread") {
      spreadFragmentNames.push(selection.name.value);
    }
  }
  return spreadFragmentNames;
}

function getFragmentFieldType(fragmentName: string, parsedFragmentField: AnyBecauseTodo, collection: AnyBecauseTodo):
  { fieldType: string, subfragment: string|null }
{
  if (collection === null) {
    // Fragments may not correspond to a collection, if eg they're on a graphql
    // type defined with addGraphQLSchema. In that case, emit a type with the
    // right set of fields but with every field having type `any` because sadly
    // we aren't yet tracking down the schema definition.
    return { fieldType: "any", subfragment: null };
  }

  const fieldName: string = parsedFragmentField.name.value;
  if (fieldName === "__typename") {
    return { fieldType: "string", subfragment: null };
  }
  const schema = getSchema(collection);
  
  // There are two ways a field name can appear in a schema. The first is as a
  // regular field with that name. The second is as a resolver with that name,
  // which may be attached to a field with the same name or a different name.
  // If there's a resolver, it takes precedence.
  
  let fieldType: string|null = null;
  
  // Check for a field with a resolver by this name
  for (let schemaFieldName of Object.keys(schema)) {
    const fieldWithResolver = schema[schemaFieldName];
    if (fieldWithResolver?.resolveAs?.fieldName === fieldName) {
      assert(!!fieldWithResolver.resolveAs.type);
      fieldType = graphqlTypeToTypescript(fieldWithResolver.resolveAs.type);
      break;
    }
  }
  
  // Check for regular presence in the schema
  if (!fieldType) {
    if (fieldName in schema) {
      const fieldSchema = schema[fieldName];
      assert(fieldSchema?.type);
      if (fieldSchema?.resolveAs?.type && !fieldSchema?.resolveAs?.fieldName) {
        fieldType = graphqlTypeToTypescript(fieldSchema.resolveAs.type);
      } else {
        fieldType = simplSchemaTypeToTypescript(schema, fieldName, schema[fieldName].type);
      }
    }
  }
  
  // If neither found, error (fragment contains a field that isn't in the schema)
  if (!fieldType) {
    throw new Error(`Fragment ${fragmentName} contains field ${fieldName} on type ${collection.collectionName} which is not in the schema`);
  }

  const {collection: subfieldCollection, nullable} = subfragmentTypeToCollection(fieldType);
  
  // Now check if the field has a sub-selector
  if (parsedFragmentField.selectionSet?.selections?.length > 0) {
    // As a special case, if the sub-selector spreads a fragment and has no
    // other fields, use that fragment's type
    if (parsedFragmentField.selectionSet.selections.length === 1
      && parsedFragmentField.selectionSet.selections[0].kind === "FragmentSpread")
    {
      const subfragmentName = parsedFragmentField.selectionSet.selections[0].name.value;
      if (fieldType.startsWith("Array<")) {
        return {
          fieldType: nullable ? `Array<${subfragmentName}>|null` : `Array<${subfragmentName}>`,
          subfragment: null
        };
      } else {
        return {
          fieldType: nullable ? `${subfragmentName}|null` : subfragmentName,
          subfragment: null
        };
      }
    }
    else
    {
      if (typeof fieldType !== "string") throw new Error("fieldType is not a string: was "+JSON.stringify(fieldType));
      if (!subfieldCollection) {
        // eslint-disable-next-line no-console
        console.log(`Field ${fieldName} in fragment ${fragmentName} has type ${fieldType} which does not identify a collection`);
        //throw new Error(`Field ${fieldName} in fragment ${fragmentName} has type ${fieldType} which does not identify a collection`);
        return {
          fieldType: "any", subfragment: null
        };
      }
      const subfragmentName = `${fragmentName}_${fieldName}`;
      const subfragment = fragmentToInterface(subfragmentName, parsedFragmentField, subfieldCollection);
      
      // If it's an array type, then it's an array of that subfragment. Otherwise it's an instance of that subfragmetn.
      if (fieldType.startsWith("Array<")) {
        return {
          fieldType: nullable ? `Array<${subfragmentName}>|null` : `Array<${subfragmentName}>`,
          subfragment: subfragment,
        };
      } else {
        return {
          fieldType: nullable ? `${subfragmentName}|null` : subfragmentName,
          subfragment: subfragment,
        };
      }
    }
  } else {
    return {
      fieldType, subfragment: null
    };
  }
}

// Given the type of a field (as a string which is a Typescript type), where
// that field is a collection type with optional array- or nullable-wrapping,
// return the collection.
function subfragmentTypeToCollection(fieldType: string): {
  collection: CollectionBase<any>|null,
  nullable: boolean,
}{
  if (fieldType.startsWith("Array<") && fieldType.endsWith(">")) {
    return {
      collection: subfragmentTypeToCollection(fieldType.substr(6, fieldType.length-7)).collection,
      nullable: false,
    };
  } else if (fieldType.endsWith("|null")) {
    return {
      collection: subfragmentTypeToCollection(fieldType.substr(0, fieldType.length-5)).collection,
      nullable: true,
    };
  } else if (fieldType.endsWith("!")) {
    return {
      collection: subfragmentTypeToCollection(fieldType.substr(0, fieldType.length-1)).collection,
      nullable: false
    };
  } else {
    const collectionName = getCollectionName(fieldType);
    if (isValidCollectionName(collectionName)) {
      return {
        collection: getCollection(collectionName),
        nullable: false
      };
    } else {
      return {
        collection: null,
        nullable: false
      }
    }
  }
}
