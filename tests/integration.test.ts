/* eslint-env mocha */
import { CollectionReference, DocumentReference, Firestore, GeoPoint, Timestamp } from '@google-cloud/firestore'
import fetch from 'node-fetch'
import assert from 'assert'

import { FirestoreDataSource } from '../src'

const firestore = new Firestore()
const USERS_COLLECTION_NAME = 'users'
const usersCollection = firestore.collection(USERS_COLLECTION_NAME)

interface UserDoc {
  readonly id: string
  readonly collection: string
  email: string
  name?: string
  createdAt?: Timestamp
  locatedAt?: GeoPoint
  documentRef?: DocumentReference
  collectionRef?: CollectionReference
}

interface Context {
  example?: string
}

class UserDataSource extends FirestoreDataSource<UserDoc, Context> {}

let userSource: UserDataSource

describe('FirestoreDataSource', () => {
  beforeEach(() => {
    userSource = new UserDataSource(usersCollection as CollectionReference<UserDoc>)
    userSource.initialize({})
  })

  afterEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {
      method: 'DELETE'
    })
  })

  it('Should throw if not given a firestore collection', async () => {
    assert.throws(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = new UserDataSource(firestore as any as CollectionReference<UserDoc>)
    }, err => {
      assert.strictEqual(err.name, 'Error')
      assert.strictEqual(err.message, 'FirestoreDataSource must be created with a Firestore collection (from @google-cloud/firestore)')
      return true
    })
  })

  it('Should throw if not called on an initialised instance', async () => {
    assert.throws(() => {
      const uninitialised = new UserDataSource(usersCollection as CollectionReference<UserDoc>)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      uninitialised.findOneById('a') // this isn't a promise
    }, err => {
      assert.strictEqual(err.name, 'Error')
      assert.strictEqual(err.message, 'DataSource not initialized')
      return true
    })
  })

  describe('createOne', () => {
    it('Should create a doc and return it', async () => {
      const newUser = {
        email: 'hello@test.com'
      }
      const { id, collection, ...data } = await userSource.createOne(newUser) as UserDoc
      assert.deepStrictEqual(data, newUser)
      assert.strictEqual(collection, USERS_COLLECTION_NAME)
      assert.notStrictEqual(id, undefined)
      assert.strictEqual(typeof id, 'string')
    })

    it('Should create a doc with a specific ID', async () => {
      const newUser = {
        id: 'amazingUser',
        email: 'hello123@test.com'
      }
      const { collection, ...created } = await userSource.createOne(newUser) as UserDoc

      const dSnap = await usersCollection.doc(created.id).get()

      assert.deepStrictEqual(created, newUser)
      assert.strictEqual(collection, USERS_COLLECTION_NAME)
      assert.deepStrictEqual({ id: dSnap.id, ...dSnap.data() }, created)
    })

    it('Should not store the id or collection as a field in the db', async () => {
      const { id, collection, ...data } = await userSource.createOne({
        email: 'hello2@test.com'
      }) as UserDoc
      const dSnap = await usersCollection.doc(id).get()
      const dbData = dSnap.data()
      assert.deepStrictEqual(dbData, data)
    })
  })

  describe('updateOne', () => {
    it('Should update a doc', async () => {
      const { id: createdId, ...created } = await userSource.createOne({
        email: 'hello@test.com'
      }) as UserDoc

      const { id: updatedId, ...updated } = await userSource.updateOne({ id: createdId, ...created, name: 'Test' }) as UserDoc

      assert.strictEqual(updatedId, createdId)
      assert.notDeepStrictEqual(updated, created)
    })
  })

  describe('updateOnePartial', () => {
    it('Should partially update a doc', async () => {
      const createData = {
        email: 'hello3@test.com'
      }
      const updateData = {
        name: 'Testson'
      }

      const { id: createdId, collection: newCollection } = await userSource.createOne(createData) as UserDoc
      const { id: updatedId, collection: updatedCollection, ...updated } = await userSource.updateOnePartial(createdId, updateData) as UserDoc

      assert.strictEqual(updatedId, createdId)
      assert.strictEqual(newCollection, updatedCollection)
      assert.deepStrictEqual(updated, { ...createData, ...updateData })
    })

    it('Partial update should update cache', async () => {
      const createData = {
        email: 'hello3@test.com'
      }
      const updateData = {
        name: 'Testson'
      }

      const { id: createdId, collection: newCollection, ...created } = await userSource.createOne(createData, { ttl: 60 }) as UserDoc
      const { id: updatedId } = await userSource.updateOnePartial(createdId, updateData) as UserDoc
      const { id: refetchedId, collection: refetchedCollection, ...refetched } = await userSource.findOneById(createdId, { ttl: 60 }) as UserDoc

      assert.strictEqual(updatedId, refetchedId)
      assert.strictEqual(newCollection, refetchedCollection)
      assert.deepStrictEqual(refetched, { ...createData, ...updateData })
      assert.notDeepStrictEqual(created, refetched)
    })

    it('Partial update should not be able to change the ID', async () => {
      const createData = {
        email: 'hello3@test.com'
      }
      const updateData = {
        name: 'Testson'
      }

      const { id: createdId, collection: newCollection } = await userSource.createOne(createData) as UserDoc
      const { id: updatedId, collection: updatedCollection, ...updated } = await userSource.updateOnePartial(createdId, { id: 'attemptedNewId', ...updateData }) as UserDoc

      const dSnap = await usersCollection.doc('attemptedNewId').get()
      assert.strictEqual(dSnap.exists, false)

      assert.strictEqual(updatedId, createdId)
      assert.strictEqual(newCollection, updatedCollection)
      assert.deepStrictEqual(updated, { ...createData, ...updateData })
    })

    it('Partial update should not be able to change the collection', async () => {
      const createData = {
        email: 'hello3@test.com'
      }
      const updateData = {
        name: 'Testson'
      }

      const { id: createdId, collection: newCollection } = await userSource.createOne(createData) as UserDoc
      const { id: updatedId, collection: updatedCollection, ...updated } = await userSource.updateOnePartial(createdId, { collection: 'newCollection', ...updateData }) as UserDoc

      const dSnap = await firestore.collection('newCollection').doc(createdId).get()
      assert.strictEqual(dSnap.exists, false)

      assert.strictEqual(updatedId, createdId)
      assert.strictEqual(newCollection, updatedCollection)
      assert.deepStrictEqual(updated, { ...createData, ...updateData })
    })
  })

  describe('deleteOne', () => {
    it('Should delete a doc', async () => {
      const { id: createdId } = await userSource.createOne({
        email: 'hello@test.com'
      }) as UserDoc

      await userSource.deleteOne(createdId)

      const dSnap = await usersCollection.doc(createdId).get()
      assert.strictEqual(dSnap.exists, false)
    })
  })

  describe('findOneById', () => {
    it('Should find a doc by ID', async () => {
      // make sure we have extra users in the DB
      // also make sure they are created outside of the DataSource
      // as things will be cached on creation
      const dRefOne = await usersCollection.add({
        email: 'hello@test.com'
      })
      const dSnapOne = await dRefOne.get()

      await usersCollection.add({
        email: 'hello22@test.com'
      })

      const foundOne = await userSource.findOneById(dRefOne.id)

      assert.deepStrictEqual(foundOne, { id: dRefOne.id, collection: dRefOne.parent.id, ...dSnapOne.data() })
    })

    it('Should cache a found doc', async () => {
      const createdOne = await userSource.createOne({
        email: 'hello@test.com'
      }) as UserDoc

      const foundOne = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      // modify db in a way that won't hit the dataSource cache
      await usersCollection.doc(createdOne.id).update({ email: 'new@test.com' })

      const foundAgain = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      assert.deepStrictEqual(foundOne, foundAgain)
    })

    it('Should serialize and de-serialize Firestore Timestamps', async () => {
      const createdOne = await userSource.createOne({
        email: 'hello@test.com',
        createdAt: Timestamp.now()
      }) as UserDoc

      const foundOne = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      // modify db in a way that won't hit the dataSource cache
      await usersCollection.doc(createdOne.id).update({ email: 'new@test.com' })

      const foundAgain = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      assert.deepStrictEqual(foundOne, foundAgain)
      assert.ok(foundAgain.createdAt instanceof Timestamp)
    })

    it('Should serialize and de-serialize Firestore GeoPoints', async () => {
      const createdOne = await userSource.createOne({
        email: 'hello@test.com',
        locatedAt: new GeoPoint(51.145, 12.5512334)
      }) as UserDoc

      const foundOne = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      // modify db in a way that won't hit the dataSource cache
      await usersCollection.doc(createdOne.id).update({ email: 'new@test.com' })

      const foundAgain = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      assert.deepStrictEqual(foundOne, foundAgain)
      assert.ok(foundAgain.locatedAt instanceof GeoPoint)
    })

    it('Should serialize and de-serialize Firestore DocumentReferences', async () => {
      const createdOne = await userSource.createOne({
        email: 'hello@test.com',
        documentRef: firestore.doc('users/abc')
      }) as UserDoc

      const foundOne = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      // modify db in a way that won't hit the dataSource cache
      await usersCollection.doc(createdOne.id).update({ email: 'new@test.com' })

      const foundAgain = await userSource.findOneById(createdOne.id, { ttl: 1000 })

      assert.deepStrictEqual(foundOne, foundAgain)
      assert.ok(foundAgain.documentRef instanceof DocumentReference)
    })
  })

  describe('findManyByIds', () => {
    it('Should find multiple documents by ID', async () => {
      // make sure we have extra users in the DB
      const createdOne = await userSource.createOne({
        email: 'hello@test.com'
      }) as UserDoc
      const createdTwo = await userSource.createOne({
        email: 'hello2@test.com'
      }) as UserDoc
      await userSource.createOne({
        email: 'hello3@test.com'
      }) as UserDoc

      const foundOnes = await userSource.findManyByIds([createdTwo.id, createdOne.id])

      assert.deepStrictEqual(foundOnes, [createdTwo, createdOne])
    })

    it('Should find more than 10 documents by ID', async () => {
      const createPromises: Array<Promise<UserDoc>> = []
      for (let idx = 0; idx < 23; idx++) {
        createPromises.push(userSource.createOne({
          email: `hello${idx}@test.com`
        }))
      }
      const created = await Promise.all(createPromises)
      await Promise.all(created.map(c => userSource.deleteFromCacheById(c.id))) // eslint-disable-line @typescript-eslint/promise-function-async

      const foundOnes = await userSource.findManyByIds(created.map(u => u.id))

      assert.deepStrictEqual(foundOnes, created)
    })
  })

  describe('findManyByQuery', () => {
    it('Should find documents by query on field', async () => {
      // make sure we have extra users in the db, avoid cached methods when creating
      const email = 'hello@test.com'
      const userOne = {
        email,
        name: 'One'
      }
      const userTwo = {
        email,
        name: 'Two'
      }
      const { id: idOne } = await usersCollection.add(userOne)
      const { id: idTwo } = await usersCollection.add(userTwo)
      await usersCollection.add({
        email: 'other@test.com',
        name: 'Three'
      })

      const result = await userSource.findManyByQuery(c => c.where('email', '==', email).orderBy('name'))

      assert.deepStrictEqual(result.map(u => u.id), [idOne, idTwo])
    })
  })
})
