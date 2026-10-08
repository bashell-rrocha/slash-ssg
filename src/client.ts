import { Counter } from "./islands/counter";
import { Gallery } from "./islands/gallery";
import { mountIslands } from "./lib/islands-client";

mountIslands({ counter: Counter, gallery: Gallery });
