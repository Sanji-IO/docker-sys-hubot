#!/bin/bash

cd /hubot
HUBOT_SLACK_TOKEN=xoxb-3614017105-lhpCpXEZwrSfSnf5bPtVyVMc forever start -c /bin/bash bin/hubot -a slack
while true; do echo \"running...\"; sleep 1; done
