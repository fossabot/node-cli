'use strict';

const printer = require('../printer');
const debug = require('../debug');
const promisify = require('util').promisify;
const cp = require('child_process');
const exec = promisify(cp.exec);
const { prompt, Select } = require('enquirer');
const { _fixed } = require('./str');
const is = require('./is');
const { __ } = require('../locales');

async function _shell(cmd, cwd = null, print = true, throw_error = true) {
  if (null === cwd) {
    cwd = process.cwd();
  }
  try {
    const result = await exec(cmd, { cwd: cwd });
    if (print) {
      if (result.stderr) {
        printer.error(result.stderr);
      }
      if (result.stdout) {
        debug.dump(result.stdout);
      }
    }
    return result;
  } catch (e) {
    if (throw_error) {
      throw e;
    }
    return e;
  }
}

/**
 * 
 * @param {string} cmd 
 * @param {*} cwd 
 * @param {*} callback 
 */
async function _exec(cmd, cwd = null, options = {}) {
  if (null === cwd) {
    cwd = process.cwd();
  }
  let opts = {
    stdio: 'inherit',
    shell: true,
    cwd: cwd
  };
  Object.assign(opts, options);
  const exec = cp.spawn(cmd, opts);
  return new Promise((resolve, reject) => {
    exec.on('exit', async function (code) {
      if (code) {
        reject(new Error(`error executing with code ${code}`));
      } else {
        resolve(code);
      }
    });
  });
}

async function _confirm(message = '', default_value = false) {
  const response = await prompt([
    {
      type: 'confirm',
      name: 'name',
      message: message,
      initial: default_value
    }
  ]);
  return response.name;
}

async function _select(message = '', choices = [], default_choice = null) {
  const options = {
    name: 'value',
    message: message,
    choices: choices
  };
  if (default_choice && choices.indexOf(default_choice) > -1) {
    options.initial = default_choice;
  }
  const prompt = new Select(options);
  return await prompt.run();
}

async function _ask(message = '', default_value = null) {
  const options = {
    type: 'input',
    name: 'name',
    message: message,
  };
  if (default_value) {
    options.initial = default_value;
  }
  const response = await prompt([
    options
  ]);
  return response.name;
}

function _table(rows = [], headers = [], options = {}) {
  let config = {
    columns_width: [],
    columns_align: [],
    margin_left: 0,
    spacing: '-',
    padding: ' '
  };
  Object.assign(config, options);
  let cols_lens = config.columns_width && config.columns_width.length ? config.columns_width : [];
  const has_headers = headers && is.array(headers) && headers.length;
  if (!cols_lens.length) {
    if (has_headers) {
      headers.map((header, index) => {
        header = `${header}`;
        if (!cols_lens[index]) {
          cols_lens[index] = 0;
        }
        if (cols_lens[index] < header.length) {
          cols_lens[index] = header.length;
        }
      });
    }
    rows.map((row) => {
      row.map((col, index) => {
        col = `${col}`;
        if (!cols_lens[index]) {
          cols_lens[index] = 0;
        }
        if (cols_lens[index] < col.length) {
          cols_lens[index] = col.length;
        }
        return col;
      });
    });
  }
  const indent = ' '.repeat(config.margin_left);
  rows.map((row) => {
    row.map((col, index) => {
      col = `${col}`;
      if (!cols_lens[index]) {
        cols_lens[index] = 0;
      }
      if (cols_lens[index] < col.length) {
        cols_lens[index] = col.length;
      }
    });
  });
  const div = cols_lens.map(col => config.spacing.repeat(col)).join(config.padding);
  // print headers
  if (has_headers) {
    let headers_str = headers.map((header, index) => _fixed(header, cols_lens[index], config.columns_align[index] || 'c')).join(config.padding);
    printer.yellow(`${indent}${headers_str}`).println();
  }
  printer.println(`${indent}${div}`);
  // print rows
  rows.forEach(row => {
    let str = row.map((col, index) => _fixed(`${col}`, cols_lens[index], config.columns_align[index] || 'c', ' ')).join(config.padding);
    printer.println(`${indent}${str}`);
    if (!has_headers) {
      printer.println(`${indent}${div}`);
    }
  });
}

async function _dispatch(opts = [], ways) {
  async function recur(curr_index, opts, ways) {
    if (is.empty(opts[curr_index])) {
      const chioce = Object.keys(ways);
      const action = await _select('', chioce);
      opts.push(action);
      ways = ways[action];
    } else {
      ways = ways[opts[curr_index]];
    }
    if (!is.empty(ways) && is.object(ways)) {
      return recur(curr_index + 1, opts, ways);
    } else if (!is.empty(ways)) {
      return ways;
    }
    return opts.join('_');
  }
  return await recur(0, opts, ways);
}

const mode_list = ['required', 'optional'];

function _check_option(command_name, opts, opt) {
  if (is.empty(opt.name)) {
    debug.stack(__('The option name cannot be empty in "${cmd}" command.', { cmd: command_name }));
  }
  if (is.contain(opts, opt.name)) {
    debug.stack(__('Option Name Duplication "${name}" in "${cmd}" command.', { cmd: command_name, name: opt.name }));
  }
  if (opt.short && is.contain(opts, opt.short)) {
    debug.stack(__('Option Short Name Duplication -${short} for ${name} option in "${cmd}" command.', { cmd: command_name, short: opt.short, name: opt.name }));
  }
  if (opt.mode && !is.contain(mode_list, opt.mode)) {
    debug.warning(__('The mode name "${mode}" is invalid in "${cmd}" command. Valid mode names are "required" or "optional"', { cmd: command_name, mode: opt.mode }));
    opt.mode = 'optional';
  }
}

function _check_argument(command_name, args, arg) {
  if (is.empty(arg.name)) {
    debug.stack(__('The argument name cannot be empty in "${cmd}" command.', { cmd: command_name }));
  }
  if (is.contain(args, arg.name)) {
    debug.stack(__('Argument Name Duplication "${name}" in "${cmd}" command.', { cmd: command_name, name: arg.name }));
  }
  if (arg.mode && !is.contain(mode_list, arg.mode)) {
    debug.warning(__('The mode name "${mode}" is invalid in "${cmd}" command. Valid mode names are "required" or "optional"', { cmd: command_name, mode: arg.mode }));
    arg.mode = 'optional';
  }
}


module.exports = {
  _ask,
  _exec,
  _shell,
  _table,
  _select,
  _confirm,
  _dispatch,
  _check_option,
  _check_argument
};
