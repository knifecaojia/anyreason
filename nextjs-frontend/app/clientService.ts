import "@/lib/clientConfig";

import type { AxiosResponse } from "axios";
import type {
  AuthJwtLoginData,
  AuthJwtLogoutData,
  CreateItemData,
  DeleteItemData,
  ReadItemData,
  RegisterRegisterData,
  ResetForgotPasswordData,
  ResetResetPasswordData,
  UsersCurrentUserData,
  BearerResponse,
  ItemRead,
  PageItemRead,
  UserRead,
} from "./openapi-client/types.gen";
import type { Options } from "./openapi-client/sdk.gen";
import {
  authJwtLogin as authJwtLoginReal,
  authJwtLogout as authJwtLogoutReal,
  createItem as createItemReal,
  deleteItem as deleteItemReal,
  readItem as readItemReal,
  registerRegister as registerRegisterReal,
  resetForgotPassword as resetForgotPasswordReal,
  resetResetPassword as resetResetPasswordReal,
  usersCurrentUser as usersCurrentUserReal,
} from "./openapi-client/sdk.gen";

const useMockApi =
  process.env.NEXT_PUBLIC_USE_MOCK_API !== "false" && process.env.USE_MOCK_API !== "false";

function ok<T>(data: T, status = 200): AxiosResponse<T> & { error: undefined } {
  return {
    data,
    status,
    statusText: "OK",
    headers: {},
    config: {},
    error: undefined,
  } as AxiosResponse<T> & { error: undefined };
}

const mockUserId = "mock-user-id";
let mockItems: ItemRead[] = [
  { id: "item-1", user_id: mockUserId, name: "示例条目", description: "Mock 数据", quantity: 1 },
];

export const authJwtLogin = <ThrowOnError extends boolean = false>(
  options: Options<AuthJwtLoginData, ThrowOnError>,
) => {
  if (!useMockApi) return authJwtLoginReal(options as never);
  const token: BearerResponse = { access_token: "mock-access-token", token_type: "bearer" };
  return Promise.resolve(ok(token)) as never;
};

export const authJwtLogout = <ThrowOnError extends boolean = false>(
  options?: Options<AuthJwtLogoutData, ThrowOnError>,
) => {
  if (!useMockApi) return authJwtLogoutReal(options as never);
  return Promise.resolve(ok({})) as never;
};

export const registerRegister = <ThrowOnError extends boolean = false>(
  options: Options<RegisterRegisterData, ThrowOnError>,
) => {
  if (!useMockApi) return registerRegisterReal(options as never);
  const body = (options as unknown as { body: { email: string } }).body;
  const user: UserRead = { id: mockUserId, email: body.email, is_active: true, is_verified: true };
  return Promise.resolve(ok(user, 201)) as never;
};

export const resetForgotPassword = <ThrowOnError extends boolean = false>(
  options: Options<ResetForgotPasswordData, ThrowOnError>,
) => {
  if (!useMockApi) return resetForgotPasswordReal(options as never);
  return Promise.resolve(ok({}, 202)) as never;
};

export const resetResetPassword = <ThrowOnError extends boolean = false>(
  options: Options<ResetResetPasswordData, ThrowOnError>,
) => {
  if (!useMockApi) return resetResetPasswordReal(options as never);
  return Promise.resolve(ok({})) as never;
};

export const usersCurrentUser = <ThrowOnError extends boolean = false>(
  options?: Options<UsersCurrentUserData, ThrowOnError>,
) => {
  if (!useMockApi) return usersCurrentUserReal(options as never);
  const user: UserRead = {
    id: mockUserId,
    email: "mock@example.com",
    is_active: true,
    is_verified: true,
  };
  return Promise.resolve(ok(user)) as never;
};

export const readItem = <ThrowOnError extends boolean = false>(
  options?: Options<ReadItemData, ThrowOnError>,
) => {
  if (!useMockApi) return readItemReal(options as never);
  const page: PageItemRead = {
    items: mockItems,
    total: mockItems.length,
    page: 1,
    size: mockItems.length,
    pages: 1,
  };
  return Promise.resolve(ok(page)) as never;
};

export const createItem = <ThrowOnError extends boolean = false>(
  options: Options<CreateItemData, ThrowOnError>,
) => {
  if (!useMockApi) return createItemReal(options as never);
  const body = (options as unknown as { body: { name: string; description?: string; quantity?: number } })
    .body;
  const item: ItemRead = {
    id: `item-${Date.now()}`,
    user_id: mockUserId,
    name: body.name,
    description: body.description ?? null,
    quantity: body.quantity ?? null,
  };
  mockItems = [item, ...mockItems];
  return Promise.resolve(ok(item)) as never;
};

export const deleteItem = <ThrowOnError extends boolean = false>(
  options: Options<DeleteItemData, ThrowOnError>,
) => {
  if (!useMockApi) return deleteItemReal(options as never);
  const itemId = (options as unknown as { path: { item_id: string } }).path.item_id;
  mockItems = mockItems.filter((item) => item.id !== itemId);
  return Promise.resolve(ok({})) as never;
};
