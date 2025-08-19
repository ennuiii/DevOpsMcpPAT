// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Simple interface to replace Azure Identity AccessToken
interface AccessToken {
  token: string;
  expiresOnTimestamp: number;
}
import { WebApi } from "azure-devops-node-api";

async function getCurrentUserDetails(tokenProvider: () => Promise<AccessToken>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  const connection = await connectionProvider();
  const url = `${connection.serverUrl}/_apis/connectionData`;
  const token = (await tokenProvider()).token;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": userAgentProvider(),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error fetching user details: ${data.message}`);
  }
  return data;
}

export { getCurrentUserDetails };
