renderhook is a macro that allows hooks to transform or wrap what your component
returns.

For example, this can be used flatten React's Context.Provider, add hidden elements to
query or style elements, add a class name, and more.

You can then pull this logic out into reusable hooks, and keep your components very
clean.

## Install

First, ensure you have [babel-plugin-macros installed and configured][1]. If you're
using create-react-app v2, it'll already be set up for you. Then install this plugin.

```sh
npm install --save renderhook
# or
yarn add renderhook
```

## Usage

If we want to provide some Context to the children, we can easily create a reusable
function for this, and make use of it in our components.

The value you pass to `renderhook` should be a two-item array, with the first value
being what `renderhook` should directly return, and the second being a function that
transforms the function component's return value.

```js
import * as React from 'react';
import renderhook from 'renderhook/macro';

const useProvide = (Provider, value) => {
  return [
    // We don't need to give the caller of `useProvide` a value, so return renderHook(useProvide(...))
    // should return `null`
    null,

    // If something is returned from the function component, we can wrap it in a Provider to
    // allow the children to receive the value in context.
    // If our component has `return <Foo />` then `element` will be `<Foo />`
    (element) => element && <Provider value={value}>{element}</Provider>,
  ];
};

const Ctx = React.createContext(null);

function MyComponent() {
  renderhook(useProvide(Ctx.Provider, { x: 1 }));

  return <Foo />;
}

function Foo() {
  const { x } = React.useContext(Ctx);

  return <div>x is {x}</div>; // displays "x is 1"
}
```
