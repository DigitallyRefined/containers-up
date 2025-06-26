import Container from 'dockerode';

export const containerApi = new Container({socketPath: '/var/run/docker.sock'});
