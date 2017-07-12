import { DocumentNode } from 'graphql';
import { QueryStoreValue } from '../queries/store';
import { NetworkStatus } from '../queries/networkStatus';

export type QueryListener = (queryStoreValue: QueryStoreValue) => void;

export type PureQueryOptions = {
  query: DocumentNode,
  variables?: { [key: string]: any};
};

export type ApolloQueryResult<T> = {
  data: T;
  loading: boolean;
  networkStatus: NetworkStatus;
  stale: boolean;
}

export enum FetchType {
  normal = 1,
  refetch = 2,
  poll = 3,
}

export type IdGetter = (value: Object) => string | null | undefined;
