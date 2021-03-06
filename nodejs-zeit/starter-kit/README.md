# nodejs-zeit

This is a starter kit for `nodejs` with `zeit`. To get started:

You first need to install the `now-cli`.

```bash
yarn global add now
```

Install the dependencies and start the now dev server:

```bash
yarn
now dev
```

## Development

If you want to add a route (say `/greet`), you can just add a new file called `greet.js` in the `api` directory. This file must have a default export function that behaves as a request handler.

Example of `greet.js`

```js
const greetHandler = (req, res) => {
  return res.json({
    "greeting"
  })
}

export default greetHandler;
```

### Throwing erros

You can throw an error object or a list of error objects from your handler. The response must be 4xx and the error object must have a string field called `message`.

```js
retun res.status(400).json({
  message: 'invalid email'
});
```

## Deployment

```bash
now
```