'use strict';

var $q = require('q');
var shjs = require('shelljs');
var mktemp = require('mktemp');

module.exports = function(robot) {
  robot.respond(/build (.*) (.*) with broker (.*)|build (.*) (.*)/i, function(msg){
    var username = msg.message.user.name;
    var env = msg.match[1].toLowerCase();
    var project = msg.match[2].toLowerCase();
    var brokerIp = msg.match[3];
    var envList = ['stage', 'production', 'test'];
    var projectList = ['mxcloud'];
    var prefixName = env + '-' + project + '-' + username;
    var jenkins = 'jenkins.192.168.31.86.xip.io';

    if ('test' === env) {
      checkCommand()
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

    if ('stage' === env) {
      checkCommand()
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

    function checkCommand() {
      var deferred = $q.defer();
      var envResult = envList.indexOf(env);
      var projectResult = projectList.indexOf(project);

      if (!shjs.which('git')) {
        msg.reply('Oops! :skull: Somthing is wrong, please to contact administrator.');
        shjs.echo('sorry, this script requires git');
        shjs.exit(1);
      }

      if (!shjs.which('docker')) {
        msg.reply('Oops! :skull: Somthing is wrong, please to contact administrator.');
        shjs.echo('Sorry, this script requires docker');
        shjs.exit(1);
      }

      if (-1 !== envResult && -1 !== projectResult) {
        if ('test' === env && !brokerIp) {
          msg.reply('Broker ip not found.');
          deferred.reject();
        } else {
          msg.reply('Preparing to build ' + env + ' of ' + project + ', please wait... :smiling_imp:');
          deferred.resolve();
        }
      } else {
        if (-1 === envReuslt) {
          msg.reply(env + ' command not found.');
        }

        if (-1 === projectResult) {
          msg.reply(project + ' not found.');
        }

        if (!brokerIp) {
          msg.reply('Broker ip not found.');
        }
        deferred.reject();
      }
      return deferred.promise;
    }

    function beforeClean() {
      var deferred = $q.defer();
      shjs.exec(
        'docker ps | grep -o ' + prefixName + '.*',
        function(code, output) {
          if (code !== 0) {
            deferred.resolve();
          } else {
            deferred.resolve(output.split('\n'));
          }
        }
      );
      return deferred.promise;
    }

    function clean(containers) {
      var deferred = $q.defer();
      var string;
      var command;

      if (containers) {
        string = containers.toString();
        console.log('containers string: ' + string);
        command = string.replace(/,/g, ' ');
        console.log('Prepare remove container: ' + command);
        shjs.exec(
          'docker rm -f ' + command,
          function(code, output) {
            if (code !== 0) {
              msg.reply('Oops! :skull: Somthing is wrong, please build ' + project + ' again.');
              shjs.echo('Error: clean container fail!');
              shjs.exit(1);
            }

            console.log(output);
            deferred.resolve();
          }
        );
      } else {
        deferred.resolve();
      }

      return deferred.promise;
    }

    function createDir() {
      var deferred = $q.defer();
      mktemp.createDir('/tmp/' + prefixName + '-XXXX', function(err, path) {
        if (err) {
          msg.reply('Oops! :skull: Somthing is wrong, please build ' + project + ' again.');
          throw new Error('create folder error');
        }

        deferred.resolve(path);
      });
      return deferred.promise;
    }

    function cloneProject(path) {
      var deferred = $q.defer();
      var downloadPath = 'http://' + jenkins + '/job/mxcloud/lastSuccessfulBuild/artifact/*zip*/archive.zip';
      var unzipCommand = 'unzip ' + path + '.zip -d ' + path;
      var refactorFolder = 'mv ' + path + '/archive/dist/* ' + path + ' && rm -rf ' + path + '/archive';
      shjs.exec(
        // 'wget https://dl.dropboxusercontent.com/u/16706203/mxcloud.tar.gz -O ' + path + '.tar.gz && tar zxvf ' + path + '.tar.gz -C ' + path,
        'wget ' + downloadPath + ' -O ' + path + '.zip && ' + unzipCommand + ' && ' + refactorFolder,
        function(code, output) {
          if (code !== 0) {
            msg.reply('Oops! :skull: Somthing is wrong, please build ' + project + ' again.');
            shjs.echo('Error: clone project fail!');
            shjs.exit(1);
          }

          console.log(output);
          deferred.resolve(path);
        }
      );
      return deferred.promise;
    }

    function buildWithDocker(path) {
      var deferred = $q.defer();
      msg.reply(project + ' is building...:smile:');
      shjs.exec(
        path + '/scripts/docker/build.sh ' + env + ' ' + prefixName + ' ' + path + ' ' + brokerIp,
        function(code, output) {
          if (code !== 0) {
            msg.reply('Oops! :skull: Somthing is wrong, please build ' + project + ' again.');
            shjs.echo('Error: docker create fail!');
            shjs.exit(1);
          }

          console.log(output);
          deferred.resolve(path);
        }
      );
      return deferred.promise;
    }

    function buildMosquittoMsg() {
      var deferred = $q.defer();
      shjs.exec(
        'docker port ' + prefixName + '-mosquitto | sed s/.*://',
        function(code, output) {
          if (code !== 0) {
            msg.reply('Oops! :skull: Somthing is wrong, please build ' + project + ' again.');
            shjs.echo('Error: docker create fail!');
            shjs.exit(1);
          }

          msg.reply('Mosquitto of ' + project + ' is running on ip: 192.168.31.85 and port: ' + output);
          deferred.resolve();
        }
      );
      return deferred.promise;
    }

    function buildEndMsg() {
      var deferred = $q.defer();
      shjs.exec(
        'docker port ' + prefixName + '-app | sed s/.*://',
        function(code, output) {
          if (code !== 0) {
            msg.reply('Oops! :skull: Somthing is wrong, please build ' + project + ' again.');
            shjs.echo('Error: build end message fail!');
            shjs.exit(1);
          }

          // Delay to send message and waiting for site running.
          setTimeout(function() {
            msg.reply('Build ' + env + ' of ' + project + ' complete...:beers:, you can visit by http://192.168.31.85:' + output);
          }, 40000);
          deferred.resolve();
        }
      );
      return deferred.promise;
    }

  });
};
