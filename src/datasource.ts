import { InMemoryLRUCache, type KeyValueCache } from '@apollo/utils.keyvaluecache'
import type { CollectionReference, PartialWithFieldValue, Query, WithFieldValue } from '@google-cloud/firestore'

import { type Logger, isFirestoreCollection, FirestoreConverter, type LibraryFields } from './helpers'
import { createCachingMethods, type CachedMethods, type FindArgs } from './cache'

export interface FirestoreDataSourceOptions {
  logger?: Logger
  cache?: KeyValueCache
}

const placeholderHandler = () => {
  throw new Error('DataSource not initialized')
}

export type QueryFindArgs = FindArgs

export class FirestoreDataSource<TData extends LibraryFields> implements CachedMethods<TData> {
  collection: CollectionReference<TData>
  logger?: Logger
  // these get set by the initializer but they must be defined or nullable after the constructor
  // runs, so we guard against using them before init
  findOneById: CachedMethods<TData>['findOneById'] = placeholderHandler
  findManyByIds: CachedMethods<TData>['findManyByIds'] = placeholderHandler
  deleteFromCacheById: CachedMethods<TData>['deleteFromCacheById'] = placeholderHandler
  primeLoader: CachedMethods<TData>['primeLoader'] = placeholderHandler
  dataLoader: CachedMethods<TData>['dataLoader']
  cache: CachedMethods<TData>['cache']
  cachePrefix: CachedMethods<TData>['cachePrefix']

  reviver = placeholderHandler
  replacer = placeholderHandler

  /**
   *
   * @param query
   * @param options
   */
  async findManyByQuery (
    queryFunction: (collection: CollectionReference<TData>) => Query<TData>,
    { ttl }: QueryFindArgs = {}
  ) {
    const qSnap = await queryFunction(this.collection).get()
    const results = qSnap.docs.map(dSnap => dSnap.data())
    // prime these into the dataloader and maybe the cache
    if (this.dataLoader && results) {
      await this.primeLoader(results, ttl)
    }
    this.logger?.debug(`FirestoreDataSource/findManyByQuery: complete. rows: ${qSnap.size}, Read Time: ${qSnap.readTime.toDate().toISOString()}`)
    return results
  }

  async createOne (newDoc: (WithFieldValue<Omit<TData, keyof LibraryFields>> & Pick<LibraryFields, 'id'> & Partial<Omit<LibraryFields, 'id'>>) | Omit<WithFieldValue<TData>, keyof LibraryFields>, { ttl }: QueryFindArgs = {}) {
    if ('id' in newDoc) {
      return await this.updateOne(newDoc)
    } else {
      const dRef = await this.collection.add(newDoc as TData)
      const dSnap = await dRef.get()
      const result = dSnap.data()
      if (result) {
        await this.primeLoader(result, ttl)
      }
      this.logger?.debug(`FirestoreDataSource/createOne: created id: ${result?.id ?? ''}`)
      return result
    }
  }

  async deleteOne (id: string) {
    this.logger?.debug(`FirestoreDataSource/deleteOne: deleting id: '${id}'`)
    const response = await this.collection.doc(id).delete()
    await this.deleteFromCacheById(id)
    return response
  }

  async updateOne (data: (WithFieldValue<Omit<TData, keyof LibraryFields>> & Pick<TData, 'id'> & Partial<Omit<LibraryFields, 'id'>>)) {
    this.logger?.debug(`FirestoreDataSource/updateOne: Updating doc id ${data.id as string}`)
    await this.collection
      .doc(data.id)
      .set(data as TData)

    const dSnap = await this.collection.doc(data.id).get()
    const result = dSnap.data()
    if (result) {
      await this.primeLoader(result)
    }
    return result
  }

  async updateOnePartial (id: string, data: PartialWithFieldValue<TData>) {
    this.logger?.debug(`FirestoreDataSource/updateOnePartial: Updating doc id ${id}`)
    await this.collection
      .doc(id)
      .set(data, { merge: true })

    const dSnap = await this.collection.doc(id).get()
    const result = dSnap.data()
    if (result) {
      await this.primeLoader(result)
    }
    return result
  }

  constructor (collection: CollectionReference<TData>, options?: FirestoreDataSourceOptions) {
    options?.logger?.debug('FirestoreDataSource started')

    if (!isFirestoreCollection(collection)) {
      throw new Error('FirestoreDataSource must be created with a Firestore collection (from @google-cloud/firestore)')
    }

    this.cache = options?.cache ?? new InMemoryLRUCache()
    this.logger = options?.logger
    this.collection = collection.withConverter(FirestoreConverter<TData>())

    const methods = createCachingMethods<TData>({
      collection: this.collection,
      cache: this.cache,
      options,
    })

    Object.assign(this, methods)
  }
}
