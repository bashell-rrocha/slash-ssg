import { FloatingNav } from "@_bashell/slash-ui/marketing";
import { mountIslands } from "../../../src/lib/islands-client";
import { PwaRegister } from "./pwa";

mountIslands({ "floating-nav": FloatingNav, pwa: PwaRegister });
