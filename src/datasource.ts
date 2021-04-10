import { DataSource } from 'apollo-datasource'
import { ApolloError } from 'apollo-server-errors'
import { InMemoryLRUCache, KeyValueCache } from 'apollo-server-caching'
import { CollectionReference, Query } from '@google-cloud/firestore'

import { Logger, isFirestoreCollection, FirestoreConverter } from './helpers'
import { createCachingMethods, CachedMethods, FindArgs } from './cache'

export interface FirestoreDataSourceOptions {
  logger?: Logger
}

const placeholderHandler = () => {
  throw new Error('DataSource not initialized')
}

export type QueryFindArgs = FindArgs

export class FirestoreDataSource<TData extends { id: string }, TContext>
  extends DataSource<TContext>
  implements CachedMethods<TData> {
  collection: CollectionReference<TData>
  context?: TContext
  options: FirestoreDataSourceOptions
  // these get set by the initializer but they must be defined or nullable after the constructor
  // runs, so we guard against using them before init
  findOneById: CachedMethods<TData>['findOneById'] = placeholderHandler
  findManyByIds: CachedMethods<TData>['findManyByIds'] = placeholderHandler
  deleteFromCacheById: CachedMethods<TData>['deleteFromCacheById'] = placeholderHandler
  dataLoader: CachedMethods<TData>['dataLoader']
  primeLoader: CachedMethods<TData>['primeLoader'] = placeholderHandler

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
      this.primeLoader(results, ttl)
    }
    this.options?.logger?.info(
      `CosmosDataSource.findManyByQuery: complete. rows: ${qSnap.size}, Read Time: ${qSnap.readTime.toDate()}`
    )
    return results
  }

  async createOne (newDoc: TData | Omit<TData, 'id'>, { ttl }: QueryFindArgs = {}) {
    if ('id' in newDoc) {
      return await this.updateOne(newDoc)
    } else {
      const dRef = await this.collection.add(newDoc as TData)
      const dSnap = await dRef.get()
      const result = dSnap.data()
      if (result) {
        this.primeLoader(result, ttl)
      }
      return result
    }
  }

  async deleteOne (id: string) {
    this.options?.logger?.info(
      `FirestoreDataSource/deleteOne: deleting id: '${id}'`
    )
    const response = await this.collection.doc(id).delete()
    await this.deleteFromCacheById(id)
    return response
  }

  async updateOne (data: TData) {
    await this.collection
      .doc(data.id)
      .set(data)

    const dSnap = await this.collection.doc(data.id).get()
    const result = dSnap.data()
    if (result) {
      this.primeLoader(result)
    }
    return result
  }

  async updateOnePartial (id: string, data: Partial<TData>) {
    this.options?.logger?.debug(
      `FirestoreDataSource/updateOnePartial: Updating doc id ${id} contents: ${JSON.stringify(data, null, '')}`
    )
    await this.collection
      .doc(id)
      .set(data, { merge: true })

    const dSnap = await this.collection.doc(id).get()
    const result = dSnap.data()
    if (result) {
      this.primeLoader(result)
    }
    return result
  }

  constructor (collection: CollectionReference<TData>, options: FirestoreDataSourceOptions = {}) {
    super()
    options?.logger?.info('FirestoreDataSource started')

    if (!isFirestoreCollection(collection)) {
      throw new ApolloError(
        'FirestoreDataSource must be created with a Firestore collection (from @google-cloud/firestore)'
      )
    }

    this.options = options
    this.collection = collection.withConverter(FirestoreConverter<TData>())
  }

  initialize ({
    context,
    cache
  }: { context?: TContext, cache?: KeyValueCache } = {}) {
    this.context = context

    const methods = createCachingMethods<TData>({
      collection: this.collection,
      cache: cache ?? new InMemoryLRUCache(),
      options: this.options
    })

    Object.assign(this, methods)
  }
}
