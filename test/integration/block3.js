const tape = require('tape')
const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const pify = require('promisify-4loc')
const sleep = require('util').promisify(setTimeout)
const SecretStack = require('secret-stack')
const u = require('../misc/util')

// alice, bob, and carol all follow each other,
// but then bob offends alice, and she blocks him.
// this means that:
//
// 1. when bob tries to connect to alice, she refuses.
// 2. alice never tries to connect to bob. (removed from peers)
// 3. carol will not give bob any, she will not give him any data from alice.

const createSsbServer = SecretStack({
  caps: { shs: crypto.randomBytes(32).toString('base64') }
})
  .use(require('ssb-db'))
  .use(require('ssb-ebt'))
  .use(require('ssb-friends'))
  .use(require('../..'))

const CONNECTION_TIMEOUT = 500 // ms
const REPLICATION_TIMEOUT = 2 * CONNECTION_TIMEOUT

const alice = createSsbServer({
  temp: 'test-block3-alice',
  timeout: CONNECTION_TIMEOUT,
  keys: ssbKeys.generate(),
})

const bob = createSsbServer({
  temp: 'test-block3-bob',
  timeout: CONNECTION_TIMEOUT,
  keys: ssbKeys.generate(),
})

const carol = createSsbServer({
  temp: 'test-block3-carol',
  timeout: CONNECTION_TIMEOUT,
  keys: ssbKeys.generate(),
})

tape('alice blocks bob while he is connected, she should disconnect him', async (t) => {
  t.plan(3)

  // in the beginning alice and bob follow each other
  await Promise.all([
    pify(alice.publish)(u.follow(bob.id)),
    pify(bob.publish)(u.follow(alice.id)),
    pify(carol.publish)(u.follow(alice.id))
  ])

  await Promise.all([
    pify(bob.connect)(carol.getAddress()),
    pify(carol.connect)(alice.getAddress()),
  ])

  const msgAtBob = await u.readOnceFromDB(bob)

  // should be the alice's follow(bob) message.
  t.equal(msgAtBob.value.author, alice.id)
  t.equal(msgAtBob.value.content.contact, bob.id)

  await pify(alice.publish)(u.block(bob.id))

  await sleep(REPLICATION_TIMEOUT)

  const clockBob = await pify(bob.getVectorClock)()
  t.equals(clockBob[alice.id], 1, 'bob does not receive the message where alice blocked him')

  await Promise.all([
    pify(alice.close)(true),
    pify(bob.close)(true),
    pify(carol.close)(true),
  ])

  t.end()
})
