import { CollectionReference, FirestoreDataConverter } from '@google-cloud/firestore'

export const isFirestoreCollection = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeCollection: any
): maybeCollection is CollectionReference => {
  return (
    maybeCollection.id &&
    maybeCollection.path &&
    maybeCollection.firestore &&
    maybeCollection.doc
  )
}

export const FirestoreConverter = <TData extends { id: string }>(): FirestoreDataConverter<TData> => ({
  toFirestore: ({ id, ...data }: Partial<TData>) => data,
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: snap.id, ...snap.data() }) as TData
})

export interface Logger {
  // Ordered from least-severe to most-severe.
  debug: (message?: string) => void
  info: (message?: string) => void
  warn: (message?: string) => void
  error: (message?: string) => void
}
