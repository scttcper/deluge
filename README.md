# deluge [![npm](https://img.shields.io/npm/v/@ctrl/deluge.svg?maxAge=3600)](https://www.npmjs.com/package/@ctrl/deluge) [![CircleCI](https://circleci.com/gh/TypeCtrl/deluge.svg?style=svg)](https://circleci.com/gh/TypeCtrl/deluge) [![coverage status](https://codecov.io/gh/typectrl/deluge/branch/master/graph/badge.svg)](https://codecov.io/gh/typectrl/deluge)

> TypeScript api wrapper for [deluge](https://deluge-torrent.org/) using [got](https://github.com/sindresorhus/got)

The advantage to writing your own http requests is the auth is already setup and type definitions are availabe for all responses.

### Install

```bash
npm install @ctrl/deluge
```

### Use

```ts
import { Deluge } from '@ctrl/deluge';

const deluge = new Deluge({
  baseURL: 'http://localhost:8112/',
  password: 'deluge',
});

async function main() {
  const res = await deluge.listTorrents();
  // listTorrents returns a TorrentListResponse and types are available
  console.log(res.result);
}
```

### API

Docs: https://typectrl.github.io/deluge/classes/deluge.html

### See Also
transmission - https://github.com/TypeCtrl/transmission
