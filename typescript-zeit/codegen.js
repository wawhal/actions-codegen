const { buildClientSchema, validate, printSchema, parse, isNonNullType, isListType, isWrappingType, isScalarType} = require('graphql');
const { codegen } = require('@graphql-codegen/core');
const typescriptPlugin = require('@graphql-codegen/typescript');
const { camelize } = require('inflection');

/*Utils*/

const getWrappingTypeMetadata = (_type) => {
  let type = JSON.parse(JSON.stringify(_type));
  const wrapperStack = [];
  while (type.kind !== 'NamedType') {
    if (type.kind === 'ListType') {
      wrapperStack.push('l');
    }
    if(type.kind === 'NonNullType') {
      wrapperStack.push('n');
    }
    type = type.type;
  }
  const typename = type.name.value;
  return {
    typename,
    stack: wrapperStack.reverse()
  }
}

const getTypescriptTypename = (_typename, wrapperStack) => {
  let typename = _typename;
  if (!wrapperStack.length || wrapperStack[0] === 'l') {
    typename = `Maybe<${typename}>`
  }
  wrapperStack.forEach((w, i) => {
    if (w === 'l') {
      if (wrapperStack[i+1] === 'n') {
        typename = `Array <${typename}>`
      } else {
        typename = `Maybe <Array<${typename}>>`
      }
    }
  });
  return typename;
}

const templater = async (actionName, actionsSdl, derive) => {

  const ast = parse(`${actionsSdl}`);

  const typesAst = {
    ...ast,
    definitions: ast.definitions.filter(d => d.name.value !== 'Mutation')
  };

  const allMutationDefs = ast.definitions.filter(d => d.name.value === 'Mutation');
  let allMutationFields = [];
  allMutationDefs.forEach(md => {
    allMutationFields = [...allMutationFields, ...md.fields]
  });

  const mutationRootDef = ast.definitions.find(d => d.name.value === 'Mutation' && d.kind === 'ObjectTypeDefinition');
  mutationRootDef.fields = allMutationFields;
  typesAst.definitions.push(mutationRootDef);

  const codegenConfig = {
    schema: typesAst,
    plugins: [
      {
        typescript: {},
      },
    ],
    pluginMap: {
      typescript: typescriptPlugin
    }
  }
  const typesCodegen = await codegen(codegenConfig);
  const typesFileMetadata = {
    content: typesCodegen,
    name: `hasuraCustomTypes.ts`
  }

  let mutationDef;
  const mutationAst = {
    ...ast,
    definitions: ast.definitions.filter(d => {
      if (d.name.value === 'Mutation') {
        if (mutationDef) return false
        mutationDef = d.fields.find(f => f.name.value === actionName);
        if (!mutationDef) {
          return false;
        } {
          return true;
        }
      }
      return false;
    })
  }

  const mutationArgType = (`Mutation${camelize(actionName)}Args`)

  const mutationName = mutationDef.name.value;
  const mutationArguments = mutationDef.arguments;
  let mutationOutputType = mutationDef.type;

  while (mutationOutputType.kind !== 'NamedType') {
    mutationOutputType = mutationOutputType.type;
  }
  const outputType = ast.definitions.find(d => {
    return (d.kind === 'ObjectTypeDefinition' && d.name.value === mutationOutputType.name.value)
  });

  const outputTypeFields = outputType.fields.map(f => f.name.value);

  let graphqlClientCode = '';
  let mutationCodegen = '';
  let validateFunction = '';
  let errorSnippet = '';
  let successSnippet = '';
  let executeFunction = '';

  const requestInputDestructured = `{ ${mutationDef.arguments.map(a => a.name.value).join(', ')} }`;

  if (derive && derive.mutation && derive.mutation.name) {

    const operationDoc = parse(derive.mutation.name);
    const operationName = operationDoc.definitions[0].selectionSet.selections.filter(s => s.name.value.indexOf('__') !== 0)[0].name.value;

    mutationCodegen = `
const HASURA_MUTATION = \`${derive.mutation.name}\`;`;

    executeFunction = `
// execute the parent mutation in Hasura
const execute = async (variables) => {
  const fetchResponse = await fetch(
    'http://localhost:8080/v1/graphql',
    {
      method: 'POST',
      body: JSON.stringify({
        query: HASURA_MUTATION,
        variables
      })
    }
  );
  return await fetchResponse.json();
};
  `


    graphqlClientCode = `
  // execute the Hasura mutation
  const { data, errors } = await execute(${requestInputDestructured});`

    errorSnippet = `  // if Hasura mutation errors, then throw error
  if (errors) {
    return res.status(400).json({
      message: errors.message
    })
  }`;

    successSnippet = `  // success
  return res.json({
    ...data.${operationName}
  })`

  }

  if (!errorSnippet) {
    errorSnippet = `  /*
  // In case of errors:
  return res.status(400).json({
    message: "error happened"
  })
  */`
  }

  if (!successSnippet) {
    successSnippet = `  // success
  return res.json({
${outputTypeFields.map(f => `    ${f}: "<value>"`).join(',\n')}
  })`;
  }

  const handlerContent = `import { ${mutationArgType} } from './hasuraCustomTypes';
${derive ? 'import fetch from "node-fetch"' : ''}

${derive ? mutationCodegen : ''}
${derive ? executeFunction : ''}
// Request Handler
const handler = async (req, res) => {

  // get request input
  const ${requestInputDestructured}: ${mutationArgType} = req.body.input;

  // run some business logic
${derive ? graphqlClientCode : ''}

${errorSnippet}

${successSnippet}

}

module.exports = handler;
`;

  const handlerFileMetadata = {
    name: `${mutationName}.ts`,
    content: handlerContent
  }

  return [handlerFileMetadata, typesFileMetadata];

}

module.exports = templater;
