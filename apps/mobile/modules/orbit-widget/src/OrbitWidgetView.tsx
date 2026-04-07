import { requireNativeView } from 'expo';
import * as React from 'react';

import type { OrbitWidgetViewProps } from './OrbitWidget.types';

const NativeView: React.ComponentType<OrbitWidgetViewProps> =
  requireNativeView('OrbitWidget');

export default function OrbitWidgetView(props: Readonly<OrbitWidgetViewProps>) {
  return <NativeView {...props} />;
}
