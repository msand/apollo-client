import {
  graphQLResultHasError,
} from '../data/storeUtils';

import {
  DocumentNode,
  SelectionSetNode,
  GraphQLError,
  ExecutionResult,
} from 'graphql';

import { isEqual } from '../util/isEqual';

import { NetworkStatus } from './networkStatus';

export class QueryStore {
  private store: {[queryId: string]: QueryStoreValue} = {};

  public get(queryId: string): QueryStoreValue {
    return this.store[queryId];
  }

  public initQuery(queryId: string, queryString: string, document: DocumentNode, storePreviousVariables: boolean,
                   variables: Object, isPoll: boolean, isRefetch: boolean, metadata: any, fetchMoreForQueryId: string | undefined) {
    const previousQuery = this.store[queryId];

    if (previousQuery && previousQuery.queryString !== queryString) {
      // XXX we're throwing an error here to catch bugs where a query gets overwritten by a new one.
      // we should implement a separate action for refetching so that QUERY_INIT may never overwrite
      // an existing query (see also: https://github.com/apollostack/apollo-client/issues/732)
      throw new Error('Internal Error: may not update existing query string in store');
    }

    let isSetVariables = false;

    let previousVariables: Object | null = null;
    if (
      storePreviousVariables &&
      previousQuery &&
      previousQuery.networkStatus !== NetworkStatus.loading
      // if the previous query was still loading, we don't want to remember it at all.
    ) {
      if (!isEqual(previousQuery.variables, variables)) {
        isSetVariables = true;
        previousVariables = previousQuery.variables;
      }
    }

    // TODO break this out into a separate function
    let newNetworkStatus = NetworkStatus.loading;

    if (isSetVariables) {
      newNetworkStatus = NetworkStatus.setVariables;
    } else if (isPoll) {
      newNetworkStatus = NetworkStatus.poll;
    } else if (isRefetch) {
      newNetworkStatus = NetworkStatus.refetch;
      // TODO: can we determine setVariables here if it's a refetch and the variables have changed?
    } else if (isPoll) {
      newNetworkStatus = NetworkStatus.poll;
    }

    // XXX right now if QUERY_INIT is fired twice, like in a refetch situation, we just overwrite
    // the store. We probably want a refetch action instead, because I suspect that if you refetch
    // before the initial fetch is done, you'll get an error.
    this.store[queryId] = {
      queryString: queryString,
      document: document,
      variables: variables,
      previousVariables,
      networkError: null,
      graphQLErrors: [],
      networkStatus: newNetworkStatus,
      metadata: metadata,
    };

    // If the action had a `moreForQueryId` property then we need to set the
    // network status on that query as well to `fetchMore`.
    //
    // We have a complement to this if statement in the query result and query
    // error action branch, but importantly *not* in the client result branch.
    // This is because the implementation of `fetchMore` *always* sets
    // `fetchPolicy` to `network-only` so we would never have a client result.
    if (typeof fetchMoreForQueryId === 'string') {
      this.store[fetchMoreForQueryId].networkStatus = NetworkStatus.fetchMore;
    }
  }

  public markQueryResult(queryId: string, result: ExecutionResult, fetchMoreForQueryId: string | undefined) {
    if (!this.store[queryId]) {
      return;
    }

    const resultHasGraphQLErrors = graphQLResultHasError(result);

    this.store[queryId].networkError = null;
    this.store[queryId].graphQLErrors = resultHasGraphQLErrors ? (result.errors ? result.errors : []) : [];
    this.store[queryId].previousVariables = null;
    this.store[queryId].networkStatus = NetworkStatus.ready;

    // If we have a `fetchMoreForQueryId` then we need to update the network
    // status for that query. See the branch for query initialization for more
    // explanation about this process.
    if (typeof fetchMoreForQueryId === 'string') {
      this.store[fetchMoreForQueryId].networkStatus = NetworkStatus.ready;
    }
  }

  public markQueryError(queryId: string, error: Error, fetchMoreForQueryId: string | undefined) {
    if (!this.store[queryId]) {
      return;
    }

    this.store[queryId].networkError = error;
    this.store[queryId].networkStatus = NetworkStatus.error;

    // If we have a `fetchMoreForQueryId` then we need to update the network
    // status for that query. See the branch for query initialization for more
    // explanation about this process.
    if (typeof fetchMoreForQueryId === 'string') {
      this.store[fetchMoreForQueryId].networkError = error;
      this.store[fetchMoreForQueryId].networkStatus = NetworkStatus.error;
    }
  }

  public markQueryResultClient(queryId: string, complete: boolean) {
    if (!this.store[queryId]) {
      return;
    }

    this.store[queryId].networkError = null;
    this.store[queryId].previousVariables = null;
    this.store[queryId].networkStatus = complete ? NetworkStatus.ready : NetworkStatus.loading;
  }

  public stopQuery(queryId: string) {
    delete this.store[queryId];
  }

  public reset(observableQueryIds: string[]) {
    // keep only the queries with query ids that are associated with observables
    const newQueries = Object.keys(this.store).filter((queryId) => {
      return (observableQueryIds.indexOf(queryId) > -1);
    }).forEach((key) => {
      // XXX set loading to true so listeners don't trigger unless they want results with partial data
      this.store[key].networkStatus = NetworkStatus.loading;
    });
  }
}

export type QueryStoreValue = {
  queryString: string;
  document: DocumentNode;
  variables: Object;
  previousVariables: Object | null;
  networkStatus: NetworkStatus;
  networkError: Error | null;
  graphQLErrors: GraphQLError[];
  metadata: any;
};

export interface SelectionSetWithRoot {
  id: string;
  typeName: string;
  selectionSet: SelectionSetNode;
}
