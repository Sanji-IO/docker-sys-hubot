/* global require,module,console,setTimeout,process */
'use strict';

var $q = require('q');
var shjs = require('shelljs');
var mktemp = require('mktemp');

module.exports = function(robot) {
  var projectList = ['mxcloud'];
  var jenkinsDomain = 'jenkins.syssw.moxa.com';
  var HOST_IP = process.env.HOST_IP || '192.168.31.86';

  robot.respond(/build stage (.*)/i, respondForStageMsg);
  robot.respond(/build test (.*) with mock/i, respondForTestMockMsg);
  robot.respond(/build test (.*) with broker (.*)/i, respondForTestBrokerMsg);

  function respondForStageMsg(msg) {
    var param = {
      msg: msg,
      username: msg.message.user.name,
      env: 'stage',
      project: msg.match[1].toLowerCase()
    };

    param.prefixName = param.env + '-' + param.project + '-' + param.username;

    init(param)
      .then(checkCommand)
      .then(beforeClean)
      .then(clean)
      .then(createDir)
      .then(cloneProject)
      .then(buildWithDocker)
      .then(buildMosquittoMsg)
      .then(buildEndMsg)
      .catch(function(e) {
        console.error(e.message);
      });
  }

  function respondForTestMockMsg(msg) {
    var param = {
      msg: msg,
      username: msg.message.user.name,
      env: 'test',
      isMock: true,
      project: msg.match[1].toLowerCase(),
      brokerIp: msg.match[2]
    };

    param.prefixName = 'mock-'+ param.env + '-' + param.project + '-' + param.username;

    init(param)
      .then(checkCommand)
      .then(beforeClean)
      .then(clean)
      .then(createDir)
      .then(cloneProject)
      .then(buildWithDocker)
      .then(buildEndMsg)
      .catch(function(e) {
        console.error(e.message);
      });
  }

  function respondForTestBrokerMsg(msg) {
    var param = {
      msg: msg,
      username: msg.message.user.name,
      env: 'test',
      project: msg.match[1].toLowerCase(),
      brokerIp: msg.match[2]
    };

    param.prefixName = param.env + '-' + param.project + '-' + param.username;

    init(param)
      .then(checkCommand)
      .then(beforeClean)
      .then(clean)
      .then(createDir)
      .then(cloneProject)
      .then(buildWithDocker)
      .then(buildEndMsg)
      .catch(function(e) {
        console.error(e.message);
      });
  }

  function init(param) {
    console.log('=== init parameters ===');
    var deferred = $q.defer();
    deferred.resolve(param);
    return deferred.promise;
  }

  function checkCommand(param) {
    console.log('=== check input command ===');
    var deferred = $q.defer();
    var projectResult = projectList.indexOf(param.project);

    if (!shjs.which('git')) {
      param.msg.reply('Oops! :skull: Somthing is wrong, please to contact administrator.');
      shjs.echo('Sorry, this script requires git');
      throw new Error('Sorry, this script requires git');
    }

    if (!shjs.which('docker')) {
      param.msg.reply('Oops! :skull: Somthing is wrong, please to contact administrator.');
      shjs.echo('Sorry, this script requires docker');
      throw new Error('Sorry, this script requires docker');
    }

    if (-1 !== projectResult) {
      if ('test' === param.env) {
        if (!param.isMock && !param.brokerIp) {
          param.msg.reply('Broker ip not found.');
          throw new Error('Broker ip not found.');
        } else {
          param.msg.reply('Preparing to build ' + param.env + ' of ' + param.project + ', please wait... :smiling_imp:');
          deferred.resolve(param);
        }
      } else {
        param.msg.reply('Preparing to build ' + param.env + ' of ' + param.project + ', please wait... :smiling_imp:');
        deferred.resolve(param);
      }
    } else {

      if (-1 === projectResult) {
        param.msg.reply(param.project + ' not found.');
        throw new Error(param.project + ' not found.');
      }

      if ('test' === param.env && !param.brokerIp) {
        param.msg.reply('Broker ip not found.');
        throw new Error('Broker ip not found.');
      }
    }
    return deferred.promise;
  }

  function beforeClean(param) {
    console.log('=== prepare to clean containers ===');
    var deferred = $q.defer();
    shjs.exec(
      'docker ps | grep -o ' + param.prefixName + '.*',
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('First time to build ' + param.project);
          deferred.resolve(param);
        } else {
          param.msg.reply('Clean last time ' + param.project + ' build');
          param.containers = output.split('\n');
          deferred.resolve(param);
        }
      }
    );
    return deferred.promise;
  }

  function clean(param) {
    console.log('=== clean containers ===');
    var deferred = $q.defer();
    var string;
    var command;

    if (param.containers) {
      string = param.containers.toString();
      command = string.replace(/,/g, ' ');
      console.log('docker rm -f ' + command);
      shjs.exec(
        'docker rm -f ' + command,
        function(code, output) {
          if (code !== 0) {
            param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
            shjs.echo('Error: clean container fail!');
            throw new Error('Error: clean container fail!');
          }

          deferred.resolve(param);
        }
      );
    } else {
      deferred.resolve(param);
    }

    return deferred.promise;
  }

  function createDir(param) {
    console.log('=== create directory ===');
    var deferred = $q.defer();
    mktemp.createDir('/tmp/' + param.prefixName + '-XXXX', function(err, path) {
      if (err) {
        param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
        throw new Error('create folder error');
      }

      if (path) {
        param.path = path;
        deferred.resolve(param);
      } else {
        deferred.reject(param);
      }
    });
    return deferred.promise;
  }

  function cloneProject(param) {
    console.log('=== clone project ===');
    var deferred = $q.defer();
    var downloadPath = 'http://' + jenkinsDomain + '/job/mxcloud/lastSuccessfulBuild/artifact/*zip*/archive.zip';
    var unzipCommand = 'unzip ' + param.path + '.zip -d ' + param.path;
    var refactorFolder = 'mv ' + param.path + '/archive/dist/* ' + param.path + ' && rm -rf ' + param.path + '/archive';
    var chmod = 'chmod 755 ' + param.path + '/scripts/docker/*';
    shjs.exec(
      'wget ' + downloadPath + ' -O ' + param.path + '.zip && ' + unzipCommand + ' && ' + refactorFolder + ' && ' + chmod,
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: clone project fail!');
          throw new Error('Error: clone project fail!');
        }

        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

  function buildWithDocker(param) {
    console.log('=== build with docker ===');
    var deferred = $q.defer();
    var args = [
      param.env,
      param.prefixName,
      param.path
    ];

    if ('test' === param.env && param.isMock) {
      args.push('');
    } else {
      if (param.brokerIp) {
        args.push(param.brokerIp);
      }
    }
    param.msg.reply(param.project + ' is building...:smile:');
    shjs.exec(
      param.path + '/scripts/docker/build.sh ' + args[0] + ' ' + args[1] + ' ' + args[2] + ' ' + args[3],
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: docker create fail!');
          throw new Error('Error: docker create fail!');
        }

        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

  function buildMosquittoMsg(param) {
    console.log('=== build mosquitto message ===');
    var deferred = $q.defer();
    shjs.exec(
      'docker port ' + param.prefixName + '-mosquitto | sed s/.*://',
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: build mosquitto message fail!');
          throw new Error('Error: build mosquitto message fail!');
        }

        param.msg.reply('Mosquitto of ' + param.project + ' is running on ip: ' + HOST_IP + ' and port: ' + output);
        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

  function buildEndMsg(param) {
    console.log('=== build end message ===');
    var deferred = $q.defer();
    shjs.exec(
      'docker port ' + param.prefixName + '-app | sed s/.*://',
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: build end message fail!');
          throw new Error('Error: build end message fail!');
        }

        // Delay to send message and waiting for site running.
        setTimeout(function() {
          param.msg.reply('Build ' + param.env + ' of ' + param.project + ' complete...:beers:, you can visit by https://' + HOST_IP + ':' + output);
        }, 50000);
        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

};
