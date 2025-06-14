import { type CollectionReference, FieldPath } from '@google-cloud/firestore'
import { type KeyValueCache } from '@apollo/utils.keyvaluecache'
import DataLoader from 'dataloader'
import { type FirestoreDataSourceOptions } from './datasource'
import { replacer, reviverFactory } from './helpers'

// https://github.com/graphql/dataloader#batch-function
const orderDocs = <V extends { id?: string }>(ids: readonly string[]) => (
  docs: Array<V | undefined>,
  keyFn?: (source: V) => string
) => {
  const keyFnDef =
    keyFn ??
    ((source: V & { id?: string }) => {
      if (source.id) return source.id
      throw new Error('Could not find ID for object; if using an alternate key, pass in a key function')
    })

  const checkNotUndefined = (input: V | undefined): input is V => {
    return Boolean(input)
  }

  const idMap: Record<string, V> = docs
    .filter(checkNotUndefined)
    .reduce((prev: Record<string, V>, cur: V) => {
      prev[keyFnDef(cur)] = cur
      return prev
    }, {})
  return ids.map((id) => idMap[id])
}

export interface createCatchingMethodArgs<DType> {
  collection: CollectionReference<DType>
  cache: KeyValueCache
  options?: FirestoreDataSourceOptions
}

export interface FindArgs {
  ttl?: number
}

export interface CachedMethods<DType> {
  findOneById: (id: string, args?: FindArgs) => Promise<DType | undefined>
  findManyByIds: (
    ids: string[],
    args?: FindArgs
  ) => Promise<Array<DType | undefined>>
  deleteFromCacheById: (id: string) => Promise<void>
  dataLoader?: DataLoader<string, DType, string>
  cache?: KeyValueCache
  cachePrefix?: string
  primeLoader: (item: DType | DType[], ttl?: number) => void | Promise<void>

  reviver: (key: string | number, value: any) => any
  replacer: (key: string | number, value: any) => string
}

export const createCachingMethods = <DType extends { id: string }>({
  collection,
  cache,
  options,
}: createCatchingMethodArgs<DType>): CachedMethods<DType> => {
  const loader = new DataLoader<string, DType>(async (ids) => {
    options?.logger?.debug(`FirestoreDataSource/DataLoader: loading for IDs: ${ids.join(', ')}`)
    const qSnap = await collection.where(FieldPath.documentId(), 'in', ids).get()
    const documents = qSnap.docs.map(dSnap => dSnap.exists ? dSnap.data() : undefined)
    options?.logger?.debug(`FirestoreDataSource/DataLoader: response count: ${documents.length}`)

    return orderDocs<DType>(ids)(documents)
  }, { maxBatchSize: 10 })

  const reviver = reviverFactory(collection)

  const cachePrefix = `firestore-${collection.path}-`

  const methods: CachedMethods<DType> = {
    findOneById: async (id, { ttl } = {}) => {
      options?.logger?.debug(`FirestoreDataSource: Running query for ID ${id}`)
      const key = cachePrefix + id

      const cacheDoc = await cache.get(key)
      if (cacheDoc && ttl) {
        return JSON.parse(cacheDoc, reviver) as DType
      }

      const doc = await loader.load(id)

      if (Number.isInteger(ttl)) {
        await cache.set(key, JSON.stringify(doc, replacer), { ttl })
      }

      return doc
    },

    findManyByIds: async (ids, args = {}) => {
      options?.logger?.debug(`FirestoreDataSource: Running query for IDs ${ids.join(', ')}`)
      return await Promise.all(ids.map(async (id) => await methods.findOneById(id, args)))
    },

    deleteFromCacheById: async (id) => {
      options?.logger?.debug(`FirestoreDataSource: Deleting from cache ${id}`)
      loader.clear(id)
      await cache.delete(cachePrefix + id)
    },
    /**
     * Loads an item or items into DataLoader and optionally the cache (if TTL is specified)
     * Use this when running a query outside of the findOneById/findManyByIds methos
     * that automatically and transparently do this
     */
    primeLoader: async (docs, ttl?: number) => {
      docs = Array.isArray(docs) ? docs : [docs]
      for (const doc of docs) {
        loader.prime(doc.id, doc)
        const key = cachePrefix + doc.id
        if (!!ttl || !!(await cache.get(key))) {
          await cache.set(key, JSON.stringify(doc, replacer), { ttl })
        }
      }
    },
    dataLoader: loader,
    cache,
    cachePrefix,
    reviver,
    replacer,
  }

  return methods
}
