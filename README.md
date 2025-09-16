# deluge [![npm](https://img.shields.io/npm/v/@ctrl/deluge.svg?maxAge=3600)](https://www.npmjs.com/package/@ctrl/deluge) [![coverage status](https://codecov.io/gh/scttcper/deluge/branch/master/graph/badge.svg)](https://codecov.io/gh/scttcper/deluge)

> TypeScript api wrapper for [deluge](https://deluge-torrent.org/) using [ofetch](https://github.com/unjs/ofetch)

### Install

```console
npm install @ctrl/deluge
```

### Use

```ts
import { Deluge } from '@ctrl/deluge';

const client = new Deluge({
  baseUrl: 'http://localhost:8112/',
  password: 'deluge',
});

async function main() {
  const res = await client.getAllData();
  console.log(res);
}
```

### API

Docs: https://deluge.vercel.app

### Normalized API

These functions have been normalized between torrent clients. Can easily support multiple torrent clients. See below for alternative supported torrent clients

##### getAllData

Returns all torrent data and an array of label objects. Data has been normalized and does not match the output of native `listTorrents()`.

```ts
const data = await client.getAllData();
console.log(data.torrents);
```

##### getTorrent

Returns one torrent data

```ts
const data = await client.getTorrent();
console.log(data);
```

##### pauseTorrent and resumeTorrent

Pause or resume a torrent

```ts
const paused = await client.pauseTorrent();
console.log(paused);
const resumed = await client.resumeTorrent();
console.log(resumed);
```

##### removeTorrent

Remove a torrent. Does not remove data on disk by default.

```ts
// does not remove data on disk
const result = await client.removeTorrent('torrent_id', false);
console.log(result);

// remove data on disk
const res = await client.removeTorrent('torrent_id', true);
console.log(res);
```

##### export and create from state

If you're shutting down the server often (serverless?) you can export the state

```ts
const state = client.exportState();
const client = Deluge.createFromState(config, state);
```

### See Also

transmission - https://github.com/scttcper/transmission  
qbittorrent - https://github.com/scttcper/qbittorrent  
utorrent - https://github.com/scttcper/utorrent  
rtorrent - https://github.com/scttcper/rtorrent

### Start a test docker container

```
docker run -d \
  --name=deluge \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Etc/UTC \
  -e DELUGE_LOGLEVEL=error `#optional` \
  -p 8112:8112 \
  -p 6881:6881 \
  -p 6881:6881/udp \
  --restart unless-stopped \
  lscr.io/linuxserver/deluge:latest
```
