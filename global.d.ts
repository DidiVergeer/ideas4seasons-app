import * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      video: React.DetailedHTMLProps<
        React.VideoHTMLAttributes<HTMLVideoElement>,
        HTMLVideoElement
      >;
    }
  }
}
