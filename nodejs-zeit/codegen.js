const { buildClientSchema, printSchema, parse, isNonNullType, isListType, isWrappingType, isScalarType} = require('graphql');

const templater = (actionName, actionsSdl, derive) => {

  const ast = parse(`${actionsSdl}`);

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
  const mutationName = mutationDef.name.value;
  const mutationArguments = mutationDef.arguments;

  let graphqlClientCode = '';
  let mutationCodegen = '';
  let validateFunction = '';

  if (derive && derive.mutation && derive.mutation.name) {
    const getSampleValue = (typename) => {
      switch(typename) {
        case 'String':
          return 'sample value';
        case 'Int':
          return 111
        case 'uuid':
          return '66e7a19a-6d5b-4851-b6e0-ea14a6f32cff';
        case 'date':
          return '2019-12-11';
        case 'timestamptz':
          return '2019-12-11T13:55:45.070803+00:00'
        default:
          return 'sample value'
      }
    };

    mutationCodegen = `
const HASURA_MUTATION = \`${derive.mutation.name}\`;`;

  validateFunction = `
const validate = (requestInput) => {
  // Perform your validation/cleanup here
  return requestInput
};
  `

  graphqlClientCode = `
  let response = await fetch(
    'http://localhost:8080/v1/graphql',
    {
      method: 'POST',
      body: JSON.stringify({
        query: HASURA_MUTATION,
        variables: validate(requestInput)
      })
    }
  )
  let responseBody = await response.json();
  if (responseBody.data) {
    return res.json(Object.values(responseBody.data)[0])
  } else if (responseBody.errors) {
    return res.status(400).json(Object.values(responseBody.errors)[0])
  }
`

  }

  const handlerContent = `
${derive ? 'const fetch = require("node-fetch")' : ''}
${derive ? mutationCodegen : ''}
${derive ? validateFunction : ''}
const handler = async (req, res) => {

  const requestInput = req.body.input;

${derive ? graphqlClientCode : ''}  
  /*

  In case of errors:
  
  return res.status(400).json({
    message: "error happened"
  })

  */

  return res.json({})

}

module.exports = handler;
`;

  const handlerFile = {
    name: `${mutationName}.js`,
    content: handlerContent
  }

  return [handlerFile];

}

module.exports = templater;