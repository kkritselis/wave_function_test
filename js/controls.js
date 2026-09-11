/**
 * First-person camera controls: WASD move, E/C vertical, mouse look.
 */

import * as THREE from 'three';

export class FlyControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = false;

    this.moveSpeed = 12;
    this.verticalSpeed = 8;
    this.lookSpeed = 0.002;

    this.keys = {
      forward: false,
      back: false,
      left: false,
      right: false,
      up: false,
      down: false,
    };

    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onClick = this.onClick.bind(this);
    this._onPointerLockChange = this.onPointerLockChange.bind(this);
  }

  connect() {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.addEventListener('click', this._onClick);
  }

  disconnect() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('click', this._onClick);
  }

  onClick() {
    if (!this.enabled) {
      this.domElement.requestPointerLock();
    }
  }

  onPointerLockChange() {
    this.enabled = document.pointerLockElement === this.domElement;
  }

  onKeyDown(event) {
    switch (event.code) {
      case 'KeyW': this.keys.forward = true; break;
      case 'KeyS': this.keys.back = true; break;
      case 'KeyA': this.keys.left = true; break;
      case 'KeyD': this.keys.right = true; break;
      case 'KeyE': this.keys.up = true; break;
      case 'KeyC': this.keys.down = true; break;
      default: break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW': this.keys.forward = false; break;
      case 'KeyS': this.keys.back = false; break;
      case 'KeyA': this.keys.left = false; break;
      case 'KeyD': this.keys.right = false; break;
      case 'KeyE': this.keys.up = false; break;
      case 'KeyC': this.keys.down = false; break;
      default: break;
    }
  }

  onMouseMove(event) {
    if (!this.enabled) return;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= event.movementX * this.lookSpeed;
    this.euler.x -= event.movementY * this.lookSpeed;
    this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  update(delta) {
    this.direction.set(0, 0, 0);

    if (this.keys.forward) this.direction.z -= 1;
    if (this.keys.back) this.direction.z += 1;
    if (this.keys.left) this.direction.x -= 1;
    if (this.keys.right) this.direction.x += 1;

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      this.direction.applyQuaternion(this.camera.quaternion);
      this.direction.y = 0;
      this.direction.normalize();
      this.camera.position.addScaledVector(this.direction, this.moveSpeed * delta);
    }

    if (this.keys.up) this.camera.position.y += this.verticalSpeed * delta;
    if (this.keys.down) this.camera.position.y -= this.verticalSpeed * delta;
  }
}
