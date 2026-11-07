import { cn as mergeClassNames } from "cn";

export const cn: typeof mergeClassNames = (...inputs) =>
  mergeClassNames(...inputs);
