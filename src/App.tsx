/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiKeyGuard } from './components/ApiKeyGuard';
import { Studio } from './components/Studio';

export default function App() {
  return (
    <ApiKeyGuard>
      <Studio />
    </ApiKeyGuard>
  );
}
