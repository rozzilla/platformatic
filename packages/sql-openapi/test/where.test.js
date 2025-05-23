'use strict'

const { clear, connInfo, isSQLite, isMysql } = require('./helper')
const { deepEqual: same, equal, ok: pass } = require('node:assert/strict')
const Snap = require('@matteo.collina/snap')
const { test } = require('node:test')
const fastify = require('fastify')
const sqlOpenAPI = require('..')
const sqlMapper = require('@platformatic/sql-mapper')

const snap = Snap(__filename)

test('list', async (t) => {
  const app = fastify()
  app.register(sqlMapper, {
    ...connInfo,
    async onDatabaseLoad (db, sql) {
      pass('onDatabaseLoad called')

      await clear(db, sql)

      if (isSQLite) {
        await db.query(sql`CREATE TABLE posts (
          id INTEGER PRIMARY KEY,
          title VARCHAR(42),
          long_text TEXT,
          counter INTEGER
        );`)
      } else if (isMysql) {
        await db.query(sql`CREATE TABLE posts (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(42),
          long_text TEXT,
          counter INTEGER
        );`)
      } else {
        await db.query(sql`CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title VARCHAR(42),
          long_text TEXT,
          counter INTEGER
        );`)
      }
    },
  })
  app.register(sqlOpenAPI)
  t.after(() => app.close())

  await app.ready()

  {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    })
    const openapi = res.json()
    const snapshot = await snap(openapi)
    same(openapi, snapshot)
  }

  const posts = [{
    title: 'Dog',
    longText: 'Foo',
    counter: 10,
  }, {
    title: 'Cat',
    longText: 'Bar',
    counter: 20,
  }, {
    title: 'Mouse',
    longText: 'Baz',
    counter: 30,
  }, {
    title: 'Duck',
    longText: 'A duck tale',
    counter: 40,
  }, {
    title: 'Bear',
    longText: null,
    counter: 50
  }]

  for (const body of posts) {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      body,
    })
    equal(res.statusCode, 200, 'POST /posts status code')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?fields=id,title,longText status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }, {
      id: 5,
      title: 'Bear',
      longText: null,
    }], 'GET /posts?fields=id,title,longText response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.eq=Dog&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.eq=Dog status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }], 'GET /posts?where.title.eq=Dog response')
  }

  // test ILIKE
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.ilike=Dog&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.ilike=Dog status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }], 'GET /posts?where.title.ilike=Dog response')
  }

  // test NULL filter
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.longText.eq=null&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.longText.eq=null Where NULL status code')
    same(res.json(), [{
      id: 5,
      title: 'Bear',
      longText: null,
    }], 'GET /posts?where.longText.eq=null Where NULL response')
  }

  // test NOT NULL filter
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.longText.neq=null&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.longText.neq=null Where NOT NULL status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }], 'GET /posts?where.longText.neq=null Where NOT NULL response')
  }

  // test NULL OR filter
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.or=(longText.eq=null|id.eq=4)&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.longText.eq=null Where NULL status code')
    same(res.json(), [
      {
        id: 4,
        title: 'Duck',
        longText: 'A duck tale',
      },
      {
        id: 5,
        title: 'Bear',
        longText: null,
      }], 'GET /posts?where.longText.eq=null Where NULL response')
  }

  // test NOT NULL OR filter
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.or=(longText.neq=null|id.eq=5)&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.longText.neq=null Where NOT NULL status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    },
    {
      id: 5,
      title: 'Bear',
      longText: null,
    }], 'GET /posts?where.longText.neq=null Where NOT NULL response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.neq=Dog&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.neq=Dog status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }, {
      id: 5,
      title: 'Bear',
      longText: null
    }], 'GET /posts?where.title.neq=Dog response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.gt=10&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.gt=10 status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }, {
      id: 5,
      title: 'Bear',
      longText: null,
    }], 'GET /posts?where.counter.gt=10 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.lt=40&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.lt=40 status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'GET /posts?where.counter.lt=40 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.lte=30&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.lte=30 posts status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'GET /posts?where.counter.lte=30 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.gte=20&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.gte=20 status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }, {
      id: 5,
      title: 'Bear',
      longText: null,
    }], 'GET /posts?where.counter.gte=20 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.in=20,30&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'posts status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'posts response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.nin=10,40&fields=id,title,longText',
    })
    equal(res.statusCode, 200, '/posts status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 5,
      title: 'Bear',
      longText: null,
    }], '/posts response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.gt=10&where.counter.lt=40&fields=id,title,longText',
    })
    equal(res.statusCode, 200, '/posts status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'posts response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.in=Dog,Cat&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.in=Dog,Cat status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }], 'GET /posts?where.title.in=Dog,Cat response')
  }

  // Skip unknown properties now
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.foo.in=Dog,Cat&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.foo.in=Dog,Cat status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }, {
      id: 5,
      title: 'Bear',
      longText: null,
    }], 'GET /posts?where.foo.in=Dog,Cat response')
  }
})

test('nested where', async (t) => {
  const app = fastify()
  app.register(sqlMapper, {
    ...connInfo,
    async onDatabaseLoad (db, sql) {
      pass('onDatabaseLoad called')

      await clear(db, sql)

      if (isMysql) {
        await db.query(sql`
          CREATE TABLE owners (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255)
          );
          CREATE TABLE posts (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(42),
            long_text TEXT,
            counter INTEGER,
            owner_id INT UNSIGNED,
            FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
          );
        `)
      } else if (isSQLite) {
        await db.query(sql`
          CREATE TABLE owners (
            id INTEGER PRIMARY KEY,
            name VARCHAR(255)
          );
        `)

        await db.query(sql`
          CREATE TABLE posts (
            id INTEGER PRIMARY KEY,
            title VARCHAR(42),
            long_text TEXT,
            counter INTEGER,
            owner_id BIGINT UNSIGNED,
            FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
          );
        `)
      } else {
        await db.query(sql`
        CREATE TABLE owners (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255)
        );
        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title VARCHAR(42),
          long_text TEXT,
          counter INTEGER,
          owner_id INTEGER REFERENCES owners(id)
        );`)
      }
    },
  })
  app.register(sqlOpenAPI)
  t.after(() => app.close())

  await app.ready()

  {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    })
    const openapi = res.json()
    const snapshot = await snap(openapi)
    same(openapi, snapshot)
  }

  const owners = [{
    name: 'Matteo',
  }, {
    name: 'Luca',
  }]

  const posts = [{
    title: 'Dog',
    longText: 'Foo',
    counter: 10,
  }, {
    title: 'Cat',
    longText: 'Bar',
    counter: 20,
  }, {
    title: 'Mouse',
    longText: 'Baz',
    counter: 30,
  }, {
    title: 'Duck',
    longText: 'A duck tale',
    counter: 40,
  }]

  {
    const toAssign = [...posts]
    for (const body of owners) {
      const res = await app.inject({
        method: 'POST',
        url: '/owners',
        body,
      })
      equal(res.statusCode, 200, 'POST /owners status code')
      const ownerId = res.json().id
      // works because we have 2 owners and 4 posts
      toAssign.shift().ownerId = ownerId
      toAssign.shift().ownerId = ownerId
    }

    for (const body of posts) {
      const res = await app.inject({
        method: 'POST',
        url: '/posts',
        body,
      })
      equal(res.statusCode, 200, 'POST /posts status code')
    }
  }

  {
    const res1 = await app.inject({
      method: 'GET',
      url: '/owners?fields=id,name',
    })

    equal(res1.statusCode, 200, 'GET /owners status code')
    const expected = [...posts]
    for (const owner of res1.json()) {
      const res2 = await app.inject({
        method: 'GET',
        url: `/posts?where.ownerId.eq=${owner.id}&fields=title,longText,counter,ownerId`,
      })
      equal(res2.statusCode, 200, 'GET /posts status code')
      same(res2.json(), [expected.shift(), expected.shift()], 'GET /posts response')
    }
  }
})

test('list with NOT NULL', async (t) => {
  const app = fastify()
  app.register(sqlMapper, {
    ...connInfo,
    async onDatabaseLoad (db, sql) {
      pass('onDatabaseLoad called')

      await clear(db, sql)

      if (isSQLite) {
        await db.query(sql`CREATE TABLE posts (
          id INTEGER PRIMARY KEY,
          title VARCHAR(42) NOT NULL,
          long_text TEXT NOT NULL,
          counter INTEGER NOT NULL
        );`)
      } else if (isMysql) {
        await db.query(sql`CREATE TABLE posts (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          counter INTEGER NOT NULL,
          long_text TEXT NOT NULL,
          title VARCHAR(42) NOT NULL
        );`)
      } else {
        await db.query(sql`CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title VARCHAR(42) NOT NULL,
          long_text TEXT NOT NULL,
          counter INTEGER NOT NULL
        );`)
      }
    },
  })
  app.register(sqlOpenAPI)
  t.after(() => app.close())

  await app.ready()

  {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    })
    const openapi = res.json()
    const snapshot = await snap(openapi)
    same(openapi, snapshot)
  }

  const posts = [{
    title: 'Dog',
    longText: 'Foo',
    counter: 10,
  }, {
    title: 'Cat',
    longText: 'Bar',
    counter: 20,
  }, {
    title: 'Mouse',
    longText: 'Baz',
    counter: 30,
  }, {
    title: 'Duck',
    longText: 'A duck tale',
    counter: 40,
  }]

  for (const body of posts) {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      body,
    })
    equal(res.statusCode, 200, 'POST /posts status code')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?fields=id,title,longText status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }], 'GET /posts?fields=id,title,longText response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.eq=Dog&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.eq=Dog status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }], 'GET /posts?where.title.eq=Dog response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.neq=Dog&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.neq=Dog status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }], 'GET /posts?where.title.neq=Dog response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.gt=10&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.gt=10 status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }], 'GET /posts?where.counter.gt=10 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.lt=40&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.lt=40 status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'GET /posts?where.counter.lt=40 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.lte=30&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.lte=30 posts status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'GET /posts?where.counter.lte=30 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.gte=20&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.counter.gte=20 status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }], 'GET /posts?where.counter.gte=20 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.in=20,30&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'posts status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'posts response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.nin=10,40&fields=id,title,longText',
    })
    equal(res.statusCode, 200, '/posts status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], '/posts response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.counter.gt=10&where.counter.lt=40&fields=id,title,longText',
    })
    equal(res.statusCode, 200, '/posts status code')
    same(res.json(), [{
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }], 'posts response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.title.in=Dog,Cat&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.title.in=Dog,Cat status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }], 'GET /posts?where.title.in=Dog,Cat response')
  }

  // Skip unknown properties now
  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.foo.in=Dog,Cat&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.foo.in=Dog,Cat status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }, {
      id: 3,
      title: 'Mouse',
      longText: 'Baz',
    }, {
      id: 4,
      title: 'Duck',
      longText: 'A duck tale',
    }], 'GET /posts?where.foo.in=Dog,Cat response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/posts?where.longText.in=Foo,Bar&fields=id,title,longText',
    })
    equal(res.statusCode, 200, 'GET /posts?where.longText.in=Foo,Bar&fields=id,title,longText status code')
    same(res.json(), [{
      id: 1,
      title: 'Dog',
      longText: 'Foo',
    }, {
      id: 2,
      title: 'Cat',
      longText: 'Bar',
    }], 'GET /posts?where.longText.in=Foo,Bar&fields=id,title,longText response')
  }
})
