/* global require,module,console,setTimeout */
'use strict';

var $q = require('q');
var shjs = require('shelljs');
var mktemp = require('mktemp');

module.exports = function(robot) {
  var projectList = ['mxcloud'];
  var jenkins = 'jenkins.192.168.31.86.xip.io';

  robot.respond(/build stage (.*)/i, respondForStageMsg);
  robot.respond(/build test (.*) with broker (.*)/i, respondForTestMsg);

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

  function respondForTestMsg(msg) {
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
    var deferred = $q.defer();
    deferred.resolve(param);
    return deferred.promise;
  }

  function checkCommand(param) {
    var deferred = $q.defer();
    var projectResult = projectList.indexOf(param.project);

    if (!shjs.which('git')) {
      param.msg.reply('Oops! :skull: Somthing is wrong, please to contact administrator.');
      shjs.echo('sorry, this script requires git');
      shjs.exit(1);
    }

    if (!shjs.which('docker')) {
      param.msg.reply('Oops! :skull: Somthing is wrong, please to contact administrator.');
      shjs.echo('Sorry, this script requires docker');
      shjs.exit(1);
    }

    if (-1 !== projectResult) {
      if ('test' === param.env && !param.brokerIp) {
        param.msg.reply('Broker ip not found.');
        deferred.reject();
      } else {
        param.msg.reply('Preparing to build ' + param.env + ' of ' + param.project + ', please wait... :smiling_imp:');
        deferred.resolve(param);
      }
    } else {

      if (-1 === projectResult) {
        param.msg.reply(param.project + ' not found.');
      }

      if ('test' === param.env && !param.brokerIp) {
        param.msg.reply('Broker ip not found.');
      }
      deferred.reject();
    }
    return deferred.promise;
  }

  function beforeClean(param) {
    var deferred = $q.defer();
    shjs.exec(
      'docker ps | grep -o ' + param.prefixName + '.*',
      function(code, output) {
        if (code !== 0) {
          deferred.resolve(param);
        } else {
          deferred.resolve(param, output.split('\n'));
        }
      }
    );
    return deferred.promise;
  }

  function clean(param, containers) {
    var deferred = $q.defer();
    var string;
    var command;

    if (containers) {
      string = containers.toString();
      command = string.replace(/,/g, ' ');
      shjs.exec(
        'docker rm -f ' + command,
        function(code, output) {
          if (code !== 0) {
            param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
            shjs.echo('Error: clean container fail!');
            shjs.exit(1);
          }

          console.log(output);
          deferred.resolve(param);
        }
      );
    } else {
      deferred.resolve(param);
    }

    return deferred.promise;
  }

  function createDir(param) {
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
    console.log('clone project path: ' + param.path);
    var deferred = $q.defer();
    var downloadPath = 'http://' + jenkins + '/job/mxcloud/lastSuccessfulBuild/artifact/*zip*/archive.zip';
    var unzipCommand = 'unzip ' + param.path + '.zip -d ' + param.path;
    var refactorFolder = 'mv ' + param.path + '/archive/dist/* ' + param.path + ' && rm -rf ' + param.path + '/archive';
    var chmod = 'chmod 755 ' + param.path + '/scripts/docker/*';
    shjs.exec(
      'wget ' + downloadPath + ' -O ' + param.path + '.zip && ' + unzipCommand + ' && ' + refactorFolder + ' && ' + chmod,
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: clone project fail!');
          shjs.exit(1);
        }

        console.log(output);
        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

  function buildWithDocker(param) {
    var deferred = $q.defer();
    param.msg.reply(param.project + ' is building...:smile:');
    shjs.exec(
      param.path + '/scripts/docker/build.sh ' + param.env + ' ' + param.prefixName + ' ' + param.path + ' ' + param.brokerIp,
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: docker create fail!');
          shjs.exit(1);
        }

        console.log(output);
        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

  function buildMosquittoMsg(param) {
    var deferred = $q.defer();
    shjs.exec(
      'docker port ' + param.prefixName + '-mosquitto | sed s/.*://',
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: docker create fail!');
          shjs.exit(1);
        }

        param.msg.reply('Mosquitto of ' + param.project + ' is running on ip: 192.168.31.85 and port: ' + output);
        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

  function buildEndMsg(param) {
    var deferred = $q.defer();
    shjs.exec(
      'docker port ' + param.prefixName + '-app | sed s/.*://',
      function(code, output) {
        if (code !== 0) {
          param.msg.reply('Oops! :skull: Somthing is wrong, please build ' + param.project + ' again.');
          shjs.echo('Error: build end message fail!');
          shjs.exit(1);
        }

        // Delay to send message and waiting for site running.
        setTimeout(function() {
          param.msg.reply('Build ' + param.env + ' of ' + param.project + ' complete...:beers:, you can visit by http://192.168.31.85:' + output);
        }, 40000);
        deferred.resolve(param);
      }
    );
    return deferred.promise;
  }

};
