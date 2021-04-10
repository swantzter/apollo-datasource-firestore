# Apollo DataSource for Firestore

This is a Firestore DataSource for Apollo GraphQL Servers. It was adapted from the [CosmosDB DataSource](https://github.com/andrejpk/apollo-datasource-cosmosdb)

## Usage

Use by creating a new class extending the `FirestoreDataSource`, with the desired document type.
Use separate DataSources for each data type, and preferably
different collections in Firestore too. Initialise the class
by passing a collection reference created by the Firestore library.

```typescript
export interface UserDoc {
  id: string // a string id value is required for entities using this library. It will be used for the
}
```
