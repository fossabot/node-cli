# @axiosleo/cli-tool

> Design for quickly developing CLI applications with Node.js

## Install

```bash
npm install @axiosleo/cli-tool
```

## Quickly create app

```js
const { App } = require('@axiosleo/cli-tool');
const app = new App();
```

## Start command line app

```js
app.start({
  name: 'cli-app-name',
  version: '1.0.0',
  commands_dir: '/path/to/commands/dir/', // will auto load command files
  commands_sort: ['help', ... ]
});

// or
app.register(require('/path/to/your/command/file'))
   // ... ...
   .register(require('/path/to/your/other-command/file'));
app.run();
```

## Run Single Command

```js
app.register(require('path/to/your/command/file'));
app.exec("<command-name>");
```

## Command Example

```js
'use strict';

const { Command } = require('@axiosleo/cli-tool');

class CommandExample extends Command {
    constructor() {
    super({
      name: 'command-name',
      desc: 'command desc',
      args: [
          {
            name: 'arg name',
            mode: 'optional', // required | optional
            desc: 'arg desc',
            default: null     // only supported optional mode
          }
      ],
      options: [
          {
            name: 'option name',
            short: 'option short name', // like 'o'
            mode: 'optional',           // required | optional
            desc: 'option desc',
            default: null               // only supported optional mode
          }
      ],
    });
  }

  async exec(args, options, argList, app) {
      // do something in here

      // get arg&option by name
      const arg1 = arg.argName;
      const option1 = options.optionName;

      // get arg by index
      const arg2 = argList[index];
  }
}

module.exports = CommandExample;
```

## Used On Command Line

```bash
# <bin> <command> <...args> [options]
<@axiosleo/cli-tool-bin> CommandName arg1 arg2 -a A -b B

# option can be placed anywhere, like this
<@axiosleo/cli-tool-bin> CommandName -a A arg1 -b B arg2
```
