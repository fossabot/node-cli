'use strict';

const minimist = require('minimist');
const printer = require('./printer');
const debug = require('./debug');

const { _confirm, _select } = require('./helper/cmd');
const { __, init } = require('./locales');
const { _exists, _search } = require('./helper/fs');
const { _str } = require('./helper/str');
const is = require('./helper/is');

const mode_list = ['required', 'optional'];

async function showAmbiguous(commandName, matched) {
  printer.println();
  if (matched.length > 1) {
    printer.error(`    ${__('Command "${name}" is ambiguous.', { name: commandName })}`);
    const commands = matched.map(command => command.config.name);
    const name = await _select(__('Did you mean one of these?'), commands);
    this.exec(name);
  } else {
    const name = matched[0].config.name;
    const res = await _confirm(__('Did you mean "${name}" command?', { name: matched[0].config.name }), true);
    if (res) {
      this.exec(name);
    }
  }
}

function resolveArgs(opts, args) {
  let alias = {};
  opts.forEach(opt => {
    if (!is.empty(opt.short)) {
      alias[opt.name] = opt.short;
    }
  });
  return minimist(args, {
    alias,
    boolean: false
  });
}

function _check_global_option(opts, opt) {
  if (is.empty(opt.name)) {
    debug.stack(__('The global option name cannot be empty.'));
  }
  if (is.contain(opts, opt.name)) {
    debug.stack(__('The global option name is repeated as "${name}".', { name: opt.name }));
  }
  if (opt.short) {
    if (is.contain(opts, opt.short)) {
      debug.stack(__('The global option short name is repeated as "-${short}" for "${name}" option.', { short: opt.short, name: opt.name }));
    }
  }
  if (opt.mode && !is.contain(mode_list, opt.mode)) {
    debug.warning(__('The mode name "${mode}" of "${name}" option is invalid. Valid mode names are "required" or "optional"', { mode: opt.mode }));
    opt.mode = 'optional';
  }
}

function _check_command(command, options, argv) {
  let opts = {};
  let args = {};
  options.forEach(opt => {
    if (argv[opt.name]) {
      opts[opt.name] = argv[opt.name];
      if (opt.short) {
        opts[opt.short] = argv[opt.name];
      }
    } else if (opt.mode === 'required') {
      debug.error(`  ${__('Required option : ${name}', { name: `--${opt.name}` })}   `);
    }
  });
  command.config.options.forEach(opt => {
    if (opt.short && opts[opt.short]) {
      debug.stack(
        __(
          'Duplication "${cmd}" command option short name "-${short}". it has been used in globel option',
          { cmd: command.config.name, short: opt.short, name: opt.name }
        )
      );
      opts[opt.short] = argv[opt.name];
    }
    if (opts[opt.name]) {
      debug.stack(__('Option Name Duplication "${name}" in "${cmd}" command.', { cmd: command.config.name, name: opt.name }));
    } else if (argv[opt.name]) {
      opts[opt.name] = argv[opt.name];
    } else if (opt.mode === 'required') {
      debug.error(`  ${__('Required option : ${name}', { name: `--${opt.name}` })}   `);
    } else {
      opts[opt.name] = opt.default;
    }
  });
  command.config.args.forEach((arg, index) => {
    if (argv._[index]) {
      args[arg.name] = argv._[index];
    } else if (arg.mode === 'required') {
      debug.error(`  ${__('Required argument : ${name}', { name: arg.name })}   `);
    } else {
      args[arg.name] = arg.default;
    }
  });
  return { opts, args };
}

class App {
  constructor(settings = {}) {
    this.commands = {};
    this.config = {
      name: '',
      version: '',
      desc: '',
      commands_dir: '',
      commands_sort: [],
      locale: {
        sets: [],
        dir: '',
        use: null
      },
      options: [
        {
          name: 'help',
          short: 'h',
          mode: 'optional',
          desc: 'Display this help message'
        },
        {
          name: 'quiet',
          short: 'q',
          mode: 'optional',
          desc: 'Do not output any message'
        }
      ],
      ...settings
    };
    this.opts = [];
    // init global options
    this.config.options.forEach(opt => {
      _check_global_option(this.opts, opt);
      this.opts.push(opt.name);
      if (opt.short) {
        this.opts.push(opt.short);
      }
    });
  }

  addGlobalOption(name, short = '', desc = '', mode = 'required', _default = null) {
    const opt = { name, short, desc: _str(desc), mode, default: _default };
    _check_global_option(this.opts, opt);
    this.config.options.push(opt);
    this.opts.push(opt.name);
    if (opt.short) {
      this.opts.push(opt.short);
    }
    return this;
  }

  locale(options = {}) {
    let locale = this.config.locale;
    Object.assign(locale, options);
    init(locale);
  }

  register(cmd) {
    let command;
    if (is.object(cmd)) {
      command = cmd;
    } else if (is.string(cmd)) {
      const Command = require(cmd);
      command = new Command();
    } else {
      command = new cmd();
    }
    const name = command.config.name;
    if (this.commands[name]) {
      debug.error(__('${name} command already exist!', { name: name }));
    }
    this.commands[name] = command;
    return this;
  }

  async start(options = {}) {
    Object.assign(this.config, options);

    // validate config fields
    let missingFields = [];
    ['name', 'version'].forEach(item => {
      if (is.empty(this.config[item])) {
        missingFields.push(item);
      }
    });
    if (missingFields.length) {
      debug.error(__('Need setting "${keys}" options for App', { keys: missingFields.join(', ') }));
    }

    // init commands
    const appconfig = this.config;
    if (appconfig.commands_dir && appconfig.commands_dir.length) {
      const dir = appconfig.commands_dir;
      const exist = await _exists(dir);
      if (exist) {
        const commands = await _search(dir);
        commands.forEach(file => {
          this.register(require(file));
        });
      } else {
        printer.warning(__('commands dir not exist on ${dir}', { dir: appconfig.commands_dir }));
      }
    }
    if (!this.commands['help']) {
      const HelpCommand = require('../commands/help');
      this.commands['help'] = new HelpCommand();
    }

    // resolve args
    const argv = resolveArgs.call(this, this.config.options, process.argv.slice(2));
    if (!argv._.length) {
      this.exec('help');
      return;
    }

    // exec with command name
    const command_ame = argv._[0];
    if (this.commands[command_ame]) {
      this.exec(command_ame, 3);
      return;
    }

    // exec with command alias name
    const matched = [];
    const keys = Object.keys(this.commands);
    for (let i = 0; i < keys.length; i++) {
      const command = this.commands[keys[i]];
      if (command.config.alias && command.config.alias.indexOf(command_ame) > -1) {
        this.exec(command_ame, 3);
        return;
      } else if (command.config.name.indexOf(command_ame) !== -1) {
        matched.push(command);
      }
    }

    // match command name
    if (matched.length === 0) {
      this.exec('help', 3);
      if (command_ame !== 'help') {
        debug.error(__('${name} command dose not exist.', { name: command_ame }));
      }
    } else {
      showAmbiguous.call(this, command_ame, matched).catch((err) => {
        if (err) {
          printer.println()
            .error('exec error :').println()
            .println(err.stack).println();
          process.exit(-1);
        }
      });
    }
  }

  async exec(name, argvSlice = 2) {
    if (is.invalid(this.commands[name])) {
      debug.error(__('${name} command dose not exist.', { name }));
    }
    const command = this.commands[name];
    let options = this.config.options;
    options = options.concat(command.config.options);
    const argv = resolveArgs.call(this, options, process.argv.slice(argvSlice));
    const hasQuietOption = this.config.options.some(opt => opt.name === 'quiet');
    if (hasQuietOption && argv.quiet === true) {
      printer.disable();
    }
    let args = {}, opts = {};
    if (name !== 'help' && argv.help) {
      if (argv.help) {
        command.usage();
        return;
      }
      let res = _check_command(command, options, argv);
      args = res.args;
      opts = res.opts;
    }
    command.exec(args, opts, argv._, this).catch((err) => {
      if (err) {
        printer.println()
          .error('exec error :').println()
          .println(err.stack).println();
        process.exit(-1);
      }
    });
  }
}

module.exports = App;
