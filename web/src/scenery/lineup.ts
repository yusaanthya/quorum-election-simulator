import * as THREE from "three";
import { roundedCylinder } from "../scene/shapes";
import { matte, place, type Theme } from "./kit";

/** A plain plinth for comparing character designs up close. */
export const lineup: Theme = {
  id: "lineup",
  title: "角色設計",
  background: ["#f1eef4", "#dcd6e3", "#c2bad0"],
  standRadius: 0,
  layout: (i, n) => {
    const x = (i - (n - 1) / 2) * 1.35;
    return [x, -Math.abs(x) * 0.12];
  },
  build(scene) {
    place(scene, new THREE.Mesh(roundedCylinder(4.2, 0.5, 0.2, 96), matte("#e6e0d8")), 0, -0.25);
    place(scene, new THREE.Mesh(roundedCylinder(4.5, 0.3, 0.12, 96), matte("#d4ccc1")), 0, -0.62);
    return 4.6;
  },
};
