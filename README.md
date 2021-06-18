# Apollo DataSource for Firestore

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![QA](https://github.com/swantzter/apollo-datasource-firestore/actions/workflows/qa.yml/badge.svg)](https://github.com/swantzter/apollo-datasource-firestore/actions/workflows/qa.yml)
[![Publish to NPM and GCR](https://github.com/swantzter/apollo-datasource-firestore/actions/workflows/publish.yml/badge.svg)](https://github.com/swantzter/apollo-datasource-firestore/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/swantzter/apollo-datasource-firestore/branch/main/graph/badge.svg)](https://codecov.io/gh/swantzter/apollo-datasource-firestore)

This is a Firestore DataSource for Apollo GraphQL Servers. It was adapted from the [CosmosDB DataSource](https://github.com/andrejpk/apollo-datasource-cosmosdb)

## Usage

Use by creating a new class extending the `FirestoreDataSource`, with the desired document type.
Use separate DataSources for each data type, and preferably
different collections in Firestore too. Initialise the class
by passing a collection reference created by the Firestore library.

```typescript
export interface UserDoc {
  // a string id value is required for entities using this library.
  // It will be used for the firestore document ID but not stored in the document in firestore.
  readonly id: string
  readonly collection: 'users'
  name: string
  groupId: number
}

export interface PostsDoc {
  readonly id: string
  readonly collection: 'posts'
  title: string
}

export class UserDataSource extends FirestoreDataStore<UserDoc, ApolloContext> {}
export class PostsDataSource extends FirestoreDataStore<PostsDoc, ApolloContext> {}

const usersCollection: CollectionReference<UserDoc> = firestore.collection('users')
const postsCollection: CollectionReference<PostsDoc> = firestore.collection('posts')

const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({
    users: new UserDataSource(usersCollection),
    posts: new PostsDataSource(postsCollection)
  })
})
```

## Custom queries

FirestoreDataSource has a `findByQuery` method that accepts a function taking the collection as its only argument, which you can then create a query based on. Can be used in resolvers or to create wrappers.

Example of derived class with custom query methods:

```typescript
export class UserDataSource extends FirestoreDataStore<UserDoc, ApolloContext> {
  async findManyByGroupId (groupId: number) {
    return this.findManyByQuery(c => c.where('groupId', '==', groupId).limit(2))
  }

  async findOneByEmail (email: string) {
    return this.findManyByQuery(c => c.where('email', '==', email).limit(1))?.[0] ?? undefined
  }
}
```

## Write Operations

This DataSource has some built-in mutations that can be used to create, update and delete documents.

```typescript
await context.dataSources.users.createOne(userDoc)

await context.dataSources.users.updateOne(userDoc)

await context.dataSources.users.updateOnePartial(userId, { name: 'Bob' })

await context.dataSources.users.deleteOne(userId)
```

## Batching

Batching is provided on all id-based queries by DataLoader.

## Caching

Caching is available on an opt-in basis by passing a `ttl` option on queries.
