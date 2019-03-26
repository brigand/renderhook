const { createMacro } = require('babel-plugin-macros');

module.exports = createMacro(renderhookMacro);

// All templates we need are initialized only once for performance.
let getTemplates;
{
  let tpls = null;
  getTemplates = (babel) => {
    if (!tpls) {
      tpls = {};
      tpls.arrayInit = babel.template`const OPS = []`;
      tpls.handleHook = babel.template`HANDLE_HOOK(OPS, RESULT)`;
      tpls.performOps = babel.template`PERFORM_OPS(OPS, VALUE)`;

      // These are so small when minified that a separate runtime module would have
      // little effect on bundle size in most cases.
      // To this point, destructuring is not used on the tuple argument.
      tpls.handleHookImpl = babel.template`
        function IDENT(ops, ret_func_tuple) {
          const retValue = ret_func_tuple[0]
          const wrapRender = ret_func_tuple[1];
          if (wrapRender) {
            ops.push(wrapRender);
          }
          return retValue;
        }
      `;
      tpls.performOpsImpl = babel.template`
        const IDENT = (ops, retValue) => ops.reduce((acc, op) => op(acc), retValue);
      `;
    }
    return tpls;
  };
}

function renderhookMacro({ references, state, babel }) {
  // This probably isn't needed
  // TODO: verify and then remove this code
  if (!references.default.length) {
    return;
  }

  const t = babel.types;
  const tpls = getTemplates(babel);

  // Once per file that uses this macro, inject the runtime helpers. The returned
  // identifier nodes should be used to refer to them, as it handles the unlikely
  // case that a variable of the same name is in scope.
  let getImplIdents;
  {
    let idents = null;
    getImplIdents = (path) => {
      if (!idents) {
        idents = {
          handleHook: path.scope.generateUidIdentifier('handle_hook'),
          performOps: path.scope.generateUidIdentifier('perform_ops'),
        };

        const program = path.isProgram()
          ? path
          : path.findParent((p) => p.isProgram());

        program
          .get('body.0')
          .insertBefore(tpls.performOpsImpl({ IDENT: idents.performOps }));
        program
          .get('body.0')
          .insertBefore(tpls.handleHookImpl({ IDENT: idents.handleHook }));
      }

      return idents;
    };
  }

  // Each function using `renderhook` needs all return statements to call `perform_hook`, and
  // this needs to happen exactly 1 time for each function.
  let initForFunc;
  {
    const opsIdent = new Map();

    initForFunc = (func) => {
      let ident = opsIdent.get(func.node);

      if (!ident) {
        ident = func.scope.generateUidIdentifier('renderhook_operations');
        func.get('body.body.0').insertBefore(tpls.arrayInit({ OPS: ident }));
        opsIdent.set(func.node, ident);

        func.traverse({
          enter(path) {
            if (path.isFunction() || path.isClass()) {
              path.skip();
              return;
            }

            if (path.isReturnStatement()) {
              path.get('argument').replaceWith(
                tpls.performOps({
                  PERFORM_OPS: getImplIdents(func).performOps,
                  OPS: ident,
                  VALUE: path.get('argument').node,
                }),
              );
            }
          },
        });
      }

      return ident;
    };
  }

  references.default.forEach((path) => {
    const call = path.parentPath;
    if (call.type === 'CallExpression') {
      const arg = call.get('arguments.0');

      let func = call.getFunctionParent();
      func.ensureBlock();

      const opsIdent = initForFunc(func);

      call.replaceWith(
        tpls.handleHook({
          OPS: opsIdent,
          HANDLE_HOOK: getImplIdents(path).handleHook,
          RESULT: call.get('arguments.0').node,
        }).expression,
      );
    } else {
      throw new Error(`renderhook/macro must be invoked as a normal function call`);
    }
  });
}
