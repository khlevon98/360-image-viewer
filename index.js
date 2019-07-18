import createSphere from "primitive-sphere";
import createCube from "primitive-cube";
import createControls from "orbit-controls";
import createCamera from "perspective-camera";
import createRegl from "regl";
import createLoop from "raf-loop";
import defined from "defined";
import assign from "object-assign";

// Generate some vertex data for a UV sphere
// This can be re-used instead of computed each time
let sphere;
let cube;

function create360Viewer(opt) {
  opt = opt || {};

  let canvas = opt.canvas || document.createElement("canvas");

  if (!sphere) {
    sphere = createCube(1, {
      segments: 64
    });
  }

  if (!cube) {
    cube = createCube(1, 1, 1, 3, 3, 3);
  }

  // Create a new regl instance
  let regl = createRegl({
    canvas: canvas
  });

  // Our perspective camera will hold projection/view matrices
  let camera = createCamera({
    fov: defined(opt.fov, (45 * Math.PI) / 180),
    near: 0.1,
    far: 10
  });

  // The mouse/touch input controls for the orbiting in 360
  let controls = createControls(
    assign({}, opt, {
      element: canvas,
      parent: window,
      rotateSpeed: defined(opt.rotateSpeed, 0.75 / (Math.PI * 2)),
      damping: defined(opt.damping, 0.35),
      zoom: false,
      pinch: false,
      distance: 0,
      mode: "sphere"
    })
  );

  // settings for gl.clear
  let clearOpts = {
    color: [0, 0, 0, 0],
    depth: 1
  };

  let gl = regl._gl;
  let destroyed = false;

  // allow HTMLImageElement or unspecified image
  let texture;
  let cubeMap;

  // We create a new "mesh" that represents our 360 textured sphere
  let drawMesh;

  if (opt.mode === "cube") {
    const faces = opt.images.map(img => getTextureParams(img));

    cubeMap = regl.cube(...faces);

    drawMesh = regl({
      // The uniforms for this shader
      uniforms: {
        // Creates a GPU texture from our Image
        envmap: cubeMap,
        // Camera matrices will have to be passed into this mesh
        projection: regl.prop("projection"),
        view: regl.prop("view")
      },
      // The fragment shader
      frag: `
      // precision mediump float;
      precision highp float;
      uniform samplerCube envmap;
      
      // varying vec3 vUv;
      varying vec3 vNorm;

            
      void main () {
        gl_FragColor = textureCube(envmap, vNorm);
      }
  `,
      vert: `
      // precision mediump float;
      precision highp float;
    
      attribute vec3 position;
      
      uniform mat4 projection;
      uniform mat4 view;
      
      varying vec3 vNorm;

      
      void main() {
        gl_Position = projection * view * vec4(position.xyz, 1.0);
        vNorm = position;
      }
    `,
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
        projection: regl.prop("projection"),
        view: regl.prop("view")
      },
      // The fragment shader
      frag: [
        "precision highp float;",
        "uniform sampler2D map;",
        "uniform vec4 color;",
        "varying vec2 vUv;",
        "void main() {",
        "  vec2 uv = 1.0 - vUv;",
        "  gl_FragColor = texture2D(map, uv);",
        "}"
      ].join("\n"),
      // The vertex shader
      vert: [
        "precision highp float;",
        "attribute vec3 position;",
        "attribute vec2 uv;",
        "uniform mat4 projection;",
        "uniform mat4 view;",
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = projection * view * vec4(position.xyz, 1.0);",
        "}"
      ].join("\n"),
      // The attributes of the mesh, position and uv (texture coordinate)
      attributes: {
        position: regl.buffer(sphere.positions),
        uv: regl.buffer(sphere.uvs)
      },
      // The indices of the mesh
      elements: regl.elements(sphere.cells)
    });
  }

  let api = createLoop(render);

  api.clearColor = opt.clearColor || clearOpts.color;
  api.canvas = canvas;
  api.enableControls = controls.enable;
  api.disableControls = controls.disable;
  api.destroy = destroy;
  api.render = render;

  api.texture = function(opt) {
    texture(getTextureParams(opt));
  };

  api.controls = controls;
  api.camera = camera;
  api.gl = gl;

  // render first frame
  render();

  return api;

  function getTextureParams(image) {
    let defaults = {
      min: "linear",
      mag: "linear"
    };
    if (
      image instanceof Image ||
      image instanceof HTMLImageElement ||
      image instanceof HTMLMediaElement ||
      image instanceof HTMLVideoElement
    ) {
      let size = image.width * image.height;
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
    if (destroyed) return;

    // poll for GL changes
    regl.poll();

    let width = gl.drawingBufferWidth;
    let height = gl.drawingBufferHeight;

    // clear contents of the drawing buffer
    clearOpts.color = api.clearColor;
    regl.clear(clearOpts);

    // update input controls and copy into our perspective camera
    controls.update();
    controls.copyInto(camera.position, camera.direction, camera.up);

    // update camera viewport and matrices
    camera.viewport[0] = 0;
    camera.viewport[1] = 0;
    camera.viewport[2] = width;
    camera.viewport[3] = height;
    camera.update();

    // draw our 360 sphere with the new camera matrices
    drawMesh({
      projection: camera.projection,
      view: camera.view
    });

    // flush all pending webgl calls
    gl.flush();
  }
}

export default create360Viewer;
