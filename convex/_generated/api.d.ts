/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as helpers_workspace from "../helpers/workspace.js";
import type * as ingestion_appendChatMessage from "../ingestion/appendChatMessage.js";
import type * as ingestion_endSession from "../ingestion/endSession.js";
import type * as ingestion_getActiveChannels from "../ingestion/getActiveChannels.js";
import type * as ingestion_startSession from "../ingestion/startSession.js";
import type * as ingestion_tokens from "../ingestion/tokens.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "helpers/workspace": typeof helpers_workspace;
  "ingestion/appendChatMessage": typeof ingestion_appendChatMessage;
  "ingestion/endSession": typeof ingestion_endSession;
  "ingestion/getActiveChannels": typeof ingestion_getActiveChannels;
  "ingestion/startSession": typeof ingestion_startSession;
  "ingestion/tokens": typeof ingestion_tokens;
  users: typeof users;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
