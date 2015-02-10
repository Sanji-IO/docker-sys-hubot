FROM node:0.10.36

MAINTAINER Zack Yang <zackcf.yang@moxa.com>

COPY . /hubot

RUN apt-get update && apt-get install -y \
    unzip &&\
    rm -rf /var/lib/apt/lists/*

# RUN /bin/bash -c "curl -L https://www.npmjs.org/install.sh | sh"
RUN npm install -g forever coffee-script

# setup ssh key
VOLUME /root/.ssh

ENTRYPOINT ["/bin/bash", "--login", "-i", "-c"]
EXPOSE 6379

CMD ["/hubot/start.sh"]
