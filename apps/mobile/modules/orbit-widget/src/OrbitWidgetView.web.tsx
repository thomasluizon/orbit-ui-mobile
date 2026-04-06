import * as React from 'react';

import type { OrbitWidgetViewProps } from './OrbitWidget.types';

export default function OrbitWidgetView(props: OrbitWidgetViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
