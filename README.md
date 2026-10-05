# deluge [![npm](https://img.shields.io/npm/v/@ctrl/deluge.svg?maxAge=3600)](https://www.npmjs.com/package/@ctrl/deluge)

> TypeScript api wrapper for [deluge](https://deluge-torrent.org/) using [ofetch](https://github.com/unjs/ofetch)

### Install

```console
npm install @ctrl/deluge
```

Requires Node.js 24 or newer.

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

Docs: https://deluge.ep.workers.dev  
Deluge API Docs: https://deluge.readthedocs.io/en/latest/reference/api.html

Things that work differently from the other clients:

- supports Deluge 2.x
- `label` needs Deluge's Label plugin, enable it with `client.enablePlugin('Label')`. Setting a label fails without it
- a label set by `normalizedAddTorrent` can take a few seconds to show up in results

### Normalized API

These functions are normalized through [@ctrl/shared-torrent](https://github.com/scttcper/shared-torrent), which makes it easier to support multiple torrent clients. See [below](#see-also) for alternative supported torrent clients.

##### getAllData

Returns all torrent data and an array of label objects. Data has been normalized and does not match the output of native `listTorrents()`.

```ts
const data = await client.getAllData();
console.log(data.torrents);
```

##### getTorrent

Returns one torrent data from torrent hash

```ts
const data = await client.getTorrent('torrent-hash');
console.log(data);
```

##### pauseTorrent and resumeTorrent

Pause or resume one or more torrents

```ts
await client.pauseTorrent('torrent-hash');
await client.resumeTorrent(['torrent-hash', 'other-torrent-hash']);
```

##### removeTorrent

Remove one or more torrents, throws if a torrent doesn't exist. Does not remove data on disk by default.

```ts
// does not remove data on disk
await client.removeTorrent('torrent-hash', false);

// remove data on disk
await client.removeTorrent(['torrent-hash', 'other-torrent-hash'], true);
```

##### queueUp and queueDown

Move a torrent up or down the queue

```ts
await client.queueUp('torrent-hash');
await client.queueDown('torrent-hash');
```

##### addTorrent

Add a torrent from a magnet link or torrent file, has client specific options. Also see normalizedAddTorrent

```ts
import { readFileSync } from 'node:fs';

const result = await client.addTorrent(new Uint8Array(readFileSync('./linux.torrent')));
console.log(result);
```

##### normalizedAddTorrent

Add a torrent and return normalized torrent data, can start a torrent paused and add label

```ts
const result = await client.normalizedAddTorrent('magnet:?xt=urn:btih:...', {
  startPaused: false,
  label: 'linux',
});
console.log(result);
```

##### Errors

Failed requests throw a `TorrentClientError` from [@ctrl/shared-torrent](https://github.com/scttcper/shared-torrent) with a `code` of `torrent_not_found`, `unauthorized`, `request_failed` or `client_error`, the http `status` when there is one and the original error as the `cause`.

```ts
import { TorrentClientError } from '@ctrl/deluge';

try {
  await client.removeTorrent('torrent-hash');
} catch (error) {
  if (error instanceof TorrentClientError && error.code === 'torrent_not_found') {
    // already removed
  }
}
```

##### export and create from state

If you're shutting down the server often (serverless?) you can export the state

```ts
const state = client.exportState();
const restored = Deluge.createFromState(config, state);
```

### See Also

All of the following npm modules provide the same normalized functions along with supporting the unique apis for each client.

- shared types - [@ctrl/shared-torrent](https://github.com/scttcper/shared-torrent)
- transmission - [@ctrl/transmission](https://github.com/scttcper/transmission)
- qbittorrent - [@ctrl/qbittorrent](https://github.com/scttcper/qbittorrent)
- utorrent - [@ctrl/utorrent](https://github.com/scttcper/utorrent)
- rtorrent - [@ctrl/rtorrent](https://github.com/scttcper/rtorrent)
- rqbit - [@ctrl/rqbit](https://github.com/scttcper/rqbit)

Usenet clients with the same normalized approach:

- usenet shared types - [@ctrl/shared-usenet](https://github.com/scttcper/shared-usenet)
- nzbget - [@ctrl/nzbget](https://github.com/scttcper/nzbget)
- sabnzbd - [@ctrl/sabnzbd](https://github.com/scttcper/sabnzbd)

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
