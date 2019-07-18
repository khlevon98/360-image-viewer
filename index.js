"use strict";

function _instanceof(left, right) { if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) { return !!right[Symbol.hasInstance](left); } else { return left instanceof right; } }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

var createSphere = require('primitive-sphere');

var createCube = require('primitive-cube');

var createControls = require('orbit-controls');

var createCamera = require('perspective-camera');

var createRegl = require('regl');

var createLoop = require('raf-loop');

var defined = require('defined');

var assign = require('object-assign'); // Generate some vertex data for a UV sphere
// This can be re-used instead of computed each time


var sphere;
var cube;
module.exports = create360Viewer;

function create360Viewer(opt) {
  opt = opt || {};
  var canvas = opt.canvas || document.createElement('canvas');

  if (!sphere) {
    sphere = createSphere(1, {
      segments: 64
    });
  }

  if (!cube) {
    cube = createCube(1, 1, 1, 3, 3, 3);
  } // Create a new regl instance


  var regl = createRegl({
    canvas: canvas
  }); // Our perspective camera will hold projection/view matrices

  var camera = createCamera({
    fov: defined(opt.fov, 45 * Math.PI / 180),
    near: 0.1,
    far: 10
  }); // The mouse/touch input controls for the orbiting in 360

  var controls = createControls(assign({}, opt, {
    element: canvas,
    parent: window,
    rotateSpeed: defined(opt.rotateSpeed, 0.75 / (Math.PI * 2)),
    damping: defined(opt.damping, 0.35),
    zoom: false,
    pinch: false,
    distance: 0,
    mode: 'sphere'
  })); // settings for gl.clear

  var clearOpts = {
    color: [0, 0, 0, 0],
    depth: 1
  };
  var gl = regl._gl;
  var destroyed = false; // allow HTMLImageElement or unspecified image

  var texture; // We create a new "mesh" that represents our 360 textured sphere

  var drawMesh;

  if (opt.mode === 'cube') {
    var faces = opt.image.map(function (img) {
      getTextureParams(img);
    });
    texture = regl.cube.apply(regl, _toConsumableArray(faces));
    drawMesh = regl({
      // The uniforms for this shader
      uniforms: {
        // Creates a GPU texture from our Image
        envmap: texture,
        // Camera matrices will have to be passed into this mesh
        projection: regl.prop('projection'),
        view: regl.prop('view')
      },
      // The fragment shader
      frag: "\n      // precision mediump float;\n      precision highp float;\n      uniform samplerCube envmap;\n      \n      // varying vec3 vUv;\n      varying vec3 vNorm;\n\n            \n      void main () {\n        gl_FragColor = textureCube(envmap, vNorm);\n      }\n  ",
      vert: "\n      // precision mediump float;\n      precision highp float;\n    \n      attribute vec3 position;\n      \n      uniform mat4 projection;\n      uniform mat4 view;\n      \n      varying vec3 vNorm;\n\n      \n      void main() {\n        gl_Position = projection * view * vec4(position.xyz, 1.0);\n        vNorm = position;\n      }\n    ",
      // The attributes of the mesh, position and uv (texture coordinate)
      attributes: {
        position: regl.buffer(cube.positions)
      },
      // The indices of the mesh
      elements: regl.elements(cube.cells)
    });
  } else {
    texture = regl.texture(getTextureParams(opt.image));
    drawMesh = regl({
      // The uniforms for this shader
      uniforms: {
        // Creates a GPU texture from our Image
        map: texture,
        // Camera matrices will have to be passed into this mesh
        projection: regl.prop('projection'),
        view: regl.prop('view')
      },
      // The fragment shader
      frag: ['precision highp float;', 'uniform sampler2D map;', 'uniform vec4 color;', 'varying vec2 vUv;', 'void main() {', '  vec2 uv = 1.0 - vUv;', '  gl_FragColor = texture2D(map, uv);', '}'].join('\n'),
      // The vertex shader
      vert: ['precision highp float;', 'attribute vec3 position;', 'attribute vec2 uv;', 'uniform mat4 projection;', 'uniform mat4 view;', 'varying vec2 vUv;', 'void main() {', '  vUv = uv;', '  gl_Position = projection * view * vec4(position.xyz, 1.0);', '}'].join('\n'),
      // The attributes of the mesh, position and uv (texture coordinate)
      attributes: {
        position: regl.buffer(sphere.positions),
        uv: regl.buffer(sphere.uvs)
      },
      // The indices of the mesh
      elements: regl.elements(sphere.cells)
    });
  }

  var api = createLoop(render);
  api.clearColor = opt.clearColor || clearOpts.color;
  api.canvas = canvas;
  api.enableControls = controls.enable;
  api.disableControls = controls.disable;
  api.destroy = destroy;
  api.render = render;

  api.texture = function (image) {
    if (opt.mode === 'cube') {
      var faces = image.map(function (img) {
        return getTextureParams(img);
      });
      texture.apply(void 0, _toConsumableArray(faces));
    } else {
      texture(getTextureParams(image));
    }
  };

  api.controls = controls;
  api.camera = camera;
  api.gl = gl; // render first frame

  render();
  return api;

  function getTextureParams(image) {
    var defaults = {
      min: 'linear',
      mag: 'linear'
    };

    if (_instanceof(image, Image) || _instanceof(image, HTMLImageElement) || _instanceof(image, HTMLMediaElement) || _instanceof(image, HTMLVideoElement)) {
      var size = image.width * image.height;
      return assign(defaults, {
        data: size > 0 ? image : null
      });
    } else {
      return assign(defaults, image);
    }
  }

  function destroy() {
    destroyed = true;
    api.stop();
    controls.disable();
    regl.destroy();
  }

  function render() {
    if (destroyed) return; // poll for GL changes

    regl.poll();
    var width = gl.drawingBufferWidth;
    var height = gl.drawingBufferHeight; // clear contents of the drawing buffer

    clearOpts.color = api.clearColor;
    regl.clear(clearOpts); // update input controls and copy into our perspective camera

    controls.update();
    controls.copyInto(camera.position, camera.direction, camera.up); // update camera viewport and matrices

    camera.viewport[0] = 0;
    camera.viewport[1] = 0;
    camera.viewport[2] = width;
    camera.viewport[3] = height;
    camera.update(); // draw our 360 sphere with the new camera matrices

    drawMesh({
      projection: camera.projection,
      view: camera.view
    }); // flush all pending webgl calls

    gl.flush();
  }
}
