<script setup lang="ts">
import { onMounted, reactive, ref, watch, toValue, computed } from "vue";
import Konva from "konva";
import _ from "lodash-es";




class Arrow extends Konva.Line {


  constructor(config: Konva.LineConfig) {
    super(config);
  }

  pointerWidth = 5;

  _sceneFunc(ctx: Konva.Context) {
    const PI2 = Math.PI * 2;

    const points = this.points();

    let dx = points[2];
    let dy = points[3];
    let radians = (Math.atan2(dy, dx) + PI2) % PI2;

    this.pointerWidth = Math.min(30, Math.max(Math.abs(dx) / 5, Math.abs(dy)) / 5) + this.getAttr("arrowWidth");

    let length = this.pointerWidth;

    ctx.save();
    ctx.beginPath();
    ctx.translate(dx, dy);
    ctx.rotate(radians);
    ctx.moveTo(0, 0);
    ctx.lineTo(-length, length / 2);
    ctx.lineTo(-length, length / 4);
    ctx.lineTo(-Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)), 0);
    ctx.lineTo(-length, -length / 4);
    ctx.lineTo(-length, -length / 2);
    ctx.closePath();
    ctx.restore();
    ctx.fillStrokeShape(this);
  }

  getSelfRect() {
    const lineRect = super.getSelfRect();
    const offset = this.pointerWidth / 2;
    return {
      x: lineRect.x - offset,
      y: lineRect.y - offset,
      width: lineRect.width + offset * 2,
      height: lineRect.height + offset * 2,
    };
  }
}

Arrow.prototype.className = "Arrow2"




class MosaicBrush extends Konva.Line {

  _sceneFunc(ctx: Konva.Context): void {
    const points = this.getAttr("points") as number[];
    const size = this.getAttr("fillWidth") || 5;
    const r = size / 2;

    if (points.length == 2) {
      ctx.beginPath();
      ctx.rect(points[0] - r, points[1] - r, size, size);
      ctx.fillStrokeShape(this);
      return;
    }

    for (let i = 2; i < points.length; i += 2) {
      if (points[i - 2] && points[i - 1]) {

        const x = points[i] - r;
        const y = points[i + 1] - r;
        const x1 = points[i - 2] - r;
        const y1 = points[i - 1] - r;

        const dx = x - x1;
        const dy = y - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        for (let j = 0; j < dist; j += size) {
          const ratio = j / dist;
          ctx.beginPath();
          ctx.rect(x1 + (ratio * dx), y1 + (ratio * dy), size, size);
          ctx.fillStrokeShape(this);
        }
      }
    }
  }
}
MosaicBrush.prototype.className = "MosaicBrush";



const TRANSFORM_CHANGE_STR = [
  'widthChange',
  'heightChange',
  'scaleXChange',
  'scaleYChange',
  'skewXChange',
  'skewYChange',
  'rotationChange',
  'offsetXChange',
  'offsetYChange',
  'transformsEnabledChange',
  'strokeWidthChange',
];

class LineTransformer extends Konva.Group {
  _node: Konva.Shape;
  _transforming = false;
  _anchorDragOffset: Konva.Vector2d;
  _movingAnchorName: string;

  constructor(config?: any) {
    super(config);
    this._createElements();
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
  }

  _getEventNamespace() {
    return "tr-konva" + this._id;
  }



  setNodes(node: Konva.Shape) {
    this.detach();
    this._node = node;
    const onChange = () => {
      this.update();
    }
    node.on(TRANSFORM_CHANGE_STR.map((e) => e + `.${this._getEventNamespace()}`).join(' '), onChange);
    node.on(`absoluteTransformChange.${this._getEventNamespace()}`, onChange);
    this.update();
  }

  nodes() {
    return [this._node];
  }

  _createBack() {
    const back = new Konva.Line({
      name: 'back',
      width: 0,
      height: 0,
      hitFunc: (ctx, shape) => {
      },
    });
    this.add(back);
  }

  _createAnchor(name: string) {
    const anchor = new Konva.Rect({
      stroke: 'rgb(0, 161, 255)',
      fill: 'white',
      strokeWidth: 1,
      name: name + ' _anchor',
      dragDistance: 0,
      hitStrokeWidth: 'auto',
    });
    const self = this;
    anchor.on('mousedown', function (e) {
      self._handleMouseDown(e);
    });
    this.add(anchor);
  }


  _createElements() {
    this._createBack();
    this._createAnchor("start_point");
    this._createAnchor("end_point");
  }


  _batchChangeChild(selector: string, attrs: any) {
    const anchor = this.findOne(selector);
    anchor.setAttrs(attrs);
  }

  _handleMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    this._transforming = true;
    this._movingAnchorName = event.target.name().split(' ')[0];
    this._anchorDragOffset = event.target.getStage().getPointerPosition();
    window.addEventListener('mousemove', this._handleMouseMove);
    window.addEventListener('mouseup', this._handleMouseUp, true);
    this._fire('transformstart', { evt: event.evt, target: this._node });
    this._node._fire('transformstart', { evt: event.evt, target: this._node });
  }


  _handleMouseMove(event: MouseEvent) {
    const anchorNode = this.findOne('.' + this._movingAnchorName);
    const stage = anchorNode.getStage();
    stage.setPointersPositions(event);
    const pp = stage.getPointerPosition();
    if (this._node) {
      const attrs = this._node.getAttrs();
      if (this._movingAnchorName == "start_point") {
        const x = attrs.points[2] - (pp.x - attrs.x);
        const y = attrs.points[3] - (pp.y - attrs.y);
        this._node.setAttr("points", [0, 0, x, y]);
        this._node.setAttrs({ x: pp.x, y: pp.y });
      } else {
        this._node.setAttr("points", [attrs.points[0], attrs.points[1], pp.x - attrs.x, pp.y - attrs.y]);
      }
      this.update();
    }
  }

  _handleMouseUp(event: MouseEvent) {
    if (this._transforming) {
      this._transforming = false;
      window.removeEventListener('mousemove', this._handleMouseMove);
      window.removeEventListener('mouseup', this._handleMouseUp, true);
      this._fire('transformend', { evt: event, target: this._node });
      if (this._node) {
        this._node._fire('transformend', { evt: event, target: this._node });
      }
      this._movingAnchorName = null;
    }
  }

  update() {
    if (this._node) {
      const attrs = this._node.getAttrs();
      this._batchChangeChild(".back", {
        points: attrs.points,
        stroke: "blue",
        strokeWidth: 1,
        offsetX: this._node.name() == "Line" ? 0.5 : 0,
        offsetY: this._node.name() == "Line" ? 0.5 : 0,
        x: attrs.x,
        y: attrs.y,
      });

      this._batchChangeChild(".start_point", {
        width: 10,
        height: 10,
        stroke: "blue",
        strokeWidth: 1,
        fill: "white",
        cornerRadius: 5,
        offsetX: 5,
        offsetY: 5,
        x: attrs.x ? attrs.x + attrs.points[0] : attrs.points[0],
        y: attrs.y ? attrs.y + attrs.points[1] : attrs.points[1],
      });

      this._batchChangeChild(".end_point", {
        width: 10,
        height: 10,
        stroke: "blue",
        strokeWidth: 1,
        fill: "white",
        cornerRadius: 5,
        offsetX: 5,
        offsetY: 5,
        x: attrs.x ? attrs.x + attrs.points[2] : attrs.points[2],
        y: attrs.y ? attrs.y + attrs.points[3] : attrs.points[3],
      });
    }
  }

  detach() {
    if (this._node) {
      this._node.off('.' + this._getEventNamespace());
    }
  }

  getClientRect() {
    if (this._node) {
      return super.getClientRect();
    } else {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }

}
LineTransformer.prototype.className = "Transformer";


class BrushTransformer extends Konva.Group {
  _node: Konva.Shape | null = null;

  constructor(config?: any) {
    super(config);
    this._createElements();
  }

  _getEventNamespace() {
    return "tr-konva" + this._id;
  }

  setNodes(node: Konva.Shape) {
    this.detach();
    this._node = node;
    const onChange = () => {
      this.update();
    };
    node.on(`absoluteTransformChange.${this._getEventNamespace()}`, onChange);
    this.update();
  }

  nodes() {
    return [this._node];
  }

  _createBack() {
    const back = new Konva.Line({
      name: "back",
      width: 0,
      height: 0,
      hitFunc: (ctx, shape) => { },
    });
    this.add(back);
  }

  _createElements() {
    this._createBack();
  }

  _batchChangeChild(selector: string, attrs: any) {
    const anchor = this.findOne(selector);
    anchor && anchor.setAttrs(attrs);
  }

  update() {
    if (this._node) {
      const attrs = this._node.getAttrs();

      this._batchChangeChild(".back", {
        points: attrs.points,
        stroke: this.getAttr("borderStroke") || "rgb(0, 161, 255)",
        strokeWidth: 1,
        offsetX: this._node.name() == "Line" ? 0.5 : 0,
        offsetY: this._node.name() == "Line" ? 0.5 : 0,
        dash: this.getAttr("borderDash"),
        x: attrs.x,
        y: attrs.y,
      });
    }
  }

  detach() {
    if (this._node) {
      this._node.off("." + this._getEventNamespace());
    }
  }

  getClientRect() {
    if (this._node) {
      return super.getClientRect();
    } else {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }
}
BrushTransformer.prototype.className = "Transformer";



let textCloseEditFunc: (() => boolean) | undefined;

function editText(text: Konva.Text): () => boolean {
  const stageBox = drawboard.container().getBoundingClientRect();
  const textPosition = text.absolutePosition();

  text.hide();
  drawboard.draw();

  const eleText = document.createElement("div");
  if (navigator.userAgent.includes("Firefox")) {
    eleText.setAttribute("contenteditable", "true");
  } else {
    eleText.setAttribute("contenteditable", "plaintext-only");
  }
  document.body.appendChild(eleText);

  eleText.innerText = text.text();
  eleText.style.position = "absolute";
  eleText.style.outline = "none";
  eleText.style.borderRadius = "5px";
  eleText.style.border = "1px solid rgb(0, 157, 255)";
  eleText.style.margin = "0";
  eleText.style.background = 'none';
  eleText.style.outline = 'none';
  eleText.style.resize = 'none';
  eleText.style.boxSizing = "border-box";
  eleText.style.minWidth = '100px';
  eleText.style.minHeight = text.fontSize() + text.padding() * 2 + 'px';
  eleText.style.left = (stageBox.left + textPosition.x - 1) + "px";
  eleText.style.top = (stageBox.top + textPosition.y - 1) + "px";
  eleText.style.padding = text.padding() + "px";
  eleText.style.fontSize = text.fontSize() + 'px';
  eleText.style.lineHeight = text.lineHeight().toString();
  eleText.style.fontFamily = text.fontFamily();
  eleText.style.transformOrigin = 'left top';
  eleText.style.textAlign = text.align();
  eleText.style.color = text.fill();

  const fontStyle = text.fontStyle();
  if (fontStyle) {
    if (fontStyle.indexOf("bold") != -1) {
      eleText.style.fontWeight = "bold";
    }
    if (fontStyle.indexOf("italic") != -1) {
      eleText.style.fontStyle = "italic";
    }
  }
  if (text.stroke() && text.strokeWidth() > 0) {
    eleText.style.webkitTextStroke = text.strokeWidth() + "px " + text.stroke();
  }

  if (text.rotation()) {
    eleText.style.transform = `rotateZ(${text.rotation()}deg)`;
  }

  let remove: (() => void) | null = () => {
    text.show();
    if (eleText.innerText.trim() == "") text.destroy();
    text.text(eleText.innerText.trim());
    boardLayer.draw();
    eleText.remove();
  };

  function removeBefore() {
    if (remove) {
      remove();
      remove = null;
      return true;
    }
    return false;
  }
  setTimeout(() => eleText.focus());
  eleText.addEventListener("blur", removeBefore, true);
  return removeBefore;
}




const shapes = ref(["Rect", "Circle", "Ellipse", "Triangle", "Line", "Arrow", "Arrow2", "Brush", "Eraser", "Text", "Mosaic", "MosaicBrush", "None"]);
const shape = ref("Rect");
const option = reactive({
  fill: false,
  color: "#ff0000",
  strokeWidth: 5,
  bold: false,
  italic: false,
  trace: false,
});
const isSelectRect = ref(false);


let drawboard: Konva.Stage;
const backgroundLayer = new Konva.Layer();
const boardLayer = new Konva.Layer({ listening: true });
const cutLayer = new Konva.Layer();
let backgroundImage: Konva.Image;
const mosaicCanvas = document.createElement("canvas");
let oldShapeType = "None";

let down = false;
let move = false;
let transformer: Konva.Transformer | LineTransformer | BrushTransformer;
let shapeObject: Konva.Shape;



const toggleHit = function () {
  boardLayer.toggleHitCanvas();
}

const downloadImage = function () {

  let config = {};
  const cutRect = cutLayer.findOne(".CutRect");
  if (cutRect) {
    const attrs = cutRect.getAttrs();
    config = {
      x: attrs.x,
      y: attrs.y,
      width: attrs.width,
      height: attrs.height
    }
  }


  const data = drawboard.toDataURL(config);
  let link = document.createElement('a');
  link.download = "result.png";
  link.href = data;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  link = null;
}


const removeTransformer = function () {
  if (transformer) {
    const node = transformer.nodes()[0];
    if (node && node.name() != "Text") {
      node.setAttrs({
        draggable: false,
        hitFunc: () => { }
      });
    }
    transformer.detach();
    transformer.destroy();
    transformer = undefined;
  }
}

const createTransformer = function (shape: Konva.Shape) {
  if (transformer && transformer.nodes()[0] == shape) return;

  removeTransformer();

  if (["Line", "Arrow", "Arrow2"].includes(shape.name())) {
    transformer = new LineTransformer();
    boardLayer.add(transformer);
    transformer.setNodes(shape);
  } else if (["Brush"].includes(shape.name())) {
    transformer = new BrushTransformer();
    boardLayer.add(transformer);
    transformer.setNodes(shape);
  } else if (!["MosaicBrush", "Eraser"].includes(shape.name())) {
    if (["Text", "Brush"].includes(shape.name())) {
      transformer = new Konva.Transformer({
        enabledAnchors: [],
        rotateEnabled: shape.name() == "Text",
        rotateAnchorOffset: 25,
        ignoreStroke: true,
        borderEnabled: true,
      });
    } else {
      transformer = new Konva.Transformer({
        ignoreStroke: true,
        rotateAnchorOffset: 35,
        keepRatio: false,
        anchorSize: 10,
        anchorCornerRadius: 5,
        anchorStrokeWidth: 1,
        borderDash: [2, 3],
      });
    }
    boardLayer.add(transformer);
    transformer.setNodes([shape]);
  }
}



const undoHistory = ref<Record<string, any>[][]>([]);
const redoHistory = ref<Record<string, any>[][]>([]);


const undo = function () {
  if (undoHistory.value.length > 0) {
    removeTransformer();
    if (textCloseEditFunc && textCloseEditFunc()) {
      textCloseEditFunc = undefined;
    }
    pushRedoHistory(undoHistory.value.pop());
    boardLayer.destroyChildren();
    if (undoHistory.value.length == 0) return;
    for (const node of undoHistory.value[undoHistory.value.length - 1]) {

      const shape = createShape(node.name, { x: node.x || 0, y: node.y || 0 }, node);
      boardLayer.add(shape);
    }
  }

}


const redo = function () {
  if (redoHistory.value.length > 0) {
    if (textCloseEditFunc && textCloseEditFunc()) {
      textCloseEditFunc = undefined;
    }
    removeTransformer();
    const nodes = redoHistory.value.pop();
    boardLayer.destroyChildren();
    for (const node of nodes) {
      const shape = createShape(node.name, { x: node.x || 0, y: node.y || 0 }, node);
      boardLayer.add(shape);
    }
    undoHistory.value.push(nodes);
  }
}


function pushUndoHistory() {
  if (boardLayer.children.length > 0) {
    const nodes = [];
    for (const item of boardLayer.children) {
      if (item.className != "Transformer") {
        const attrs = _.cloneDeep(item.getAttrs());
        attrs.draggable = false;
        attrs.hitFunc = () => { };
        nodes.push(attrs);
      }
    }
    undoHistory.value.push(nodes);
    redoHistory.value.splice(0, redoHistory.value.length);
  }
}


function pushRedoHistory(nodes: Record<string, any>[]) {
  redoHistory.value.push(nodes);
}

function clearHistory() {
  undoHistory.value.splice(0, undoHistory.value.length);
  redoHistory.value.splice(0, redoHistory.value.length);
}


function clearCanvas() {
  clearHistory();
  boardLayer.destroyChildren();
  clearSelectRect();
}



function createShape(type: string, { x, y }: { x: number, y: number }, attrs: Konva.ShapeConfig = {}) {
  let shape: Konva.Shape;
  switch (type) {
    case "Rect": {
      shape = new Konva.Rect({
        x: x,
        y: y,
        width: 1,
        height: 1,
        fill: option.fill ? "blue" : "",
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        draggable: true,
        strokeScaleEnabled: false,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        name: "Rect",
        hitFunc: (ctx, shape) => {
          ctx.beginPath();
          ctx.rect(0, 0, shape.width(), shape.height());
          ctx.strokeShape(shape);
        },
        ...attrs,
      });
    }
      break
    case "Circle": {
      shape = new Konva.Circle({
        x: x,
        y: y,
        width: 1,
        height: 1,
        radius: 1,
        fill: option.fill ? "blue" : "",
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        draggable: true,
        strokeScaleEnabled: false,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        name: "Circle",
        hitFunc: (ctx, shape) => {
          ctx.beginPath();
          ctx.arc(0, 0, shape.getAttr("radius"), 0, 2 * Math.PI);
          ctx.strokeShape(shape);
        },
        ...attrs,
      });
    }
      break
    case "Ellipse": {
      shape = new Konva.Ellipse({
        x: x,
        y: y,
        radiusX: 1,
        radiusY: 1,
        fill: option.fill ? "blue" : "",
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        draggable: true,
        strokeScaleEnabled: false,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        name: "Ellipse",
        hitFunc: (ctx, shape) => {
          ctx.beginPath();
          ctx.ellipse(0, 0, shape.getAttr("radiusX"), shape.getAttr("radiusY"), 0, 0, 2 * Math.PI);
          ctx.strokeShape(shape);
        },
        ...attrs,

      });
    }
      break
    case "Triangle": {
      shape = new Konva.Line({
        points: [x, y, x, y, x, y],
        closed: true,
        stroke: option.color,
        fill: option.fill ? "blue" : "",
        strokeWidth: option.strokeWidth,
        draggable: true,
        strokeScaleEnabled: false,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        lineCap: 'round',
        lineJoin: 'round',
        name: "Triangle",
        hitFunc: (ctx, shape) => {
          const points = shape.getAttr("points") as number[];
          ctx.beginPath();
          ctx.moveTo(points[0], points[1]);
          ctx.lineTo(points[2], points[3]);
          ctx.lineTo(points[4], points[5]);
          ctx.closePath();
          ctx.strokeShape(shape);
        },
        ...attrs,

      });
    }
      break;
    case "Line": {
      shape = new Konva.Line({
        x: x,
        y: y,
        points: [0, 0, 1, 1],
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        lineCap: 'round',
        lineJoin: 'round',
        draggable: true,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        ...attrs,
        name: "Line",
      });
    }
      break;
    case "Arrow": {
      shape = new Konva.Arrow({
        x: x,
        y: y,
        points: [0, 0, 1, 1],
        // pointerLength: option.strokeWidth,
        // pointerWidth: option.strokeWidth,
        fill: "blue",
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        draggable: true,
        strokeScaleEnabled: false,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        ...attrs,
        name: "Arrow",
      });
    }
      break;
    case "Arrow2": {
      shape = new Arrow({
        x: x,
        y: y,
        points: [0, 0, 1, 1],
        stroke: option.color,
        // fill: option.color,
        strokeWidth: 5,
        draggable: true,
        strokeScaleEnabled: false,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        lineCap: 'round',
        lineJoin: 'round',
        arrowWidth: option.strokeWidth,
        ...attrs,
        name: "Arrow2",
      });
    }
      break;
    case "Brush": {
      shape = new Konva.Line({
        points: [x, y],
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        lineCap: 'round',
        lineJoin: 'round',
        draggable: true,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        ...attrs,
        name: "Brush"
      });
    }
      break;
    case "Eraser": {
      shape = new Konva.Line({
        points: [x, y],
        stroke: option.color,
        strokeWidth: option.strokeWidth,
        lineCap: 'round',
        lineJoin: 'round',
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        name: "Eraser",
        hitFunc: (con, shape) => { },
        globalCompositeOperation: "destination-out",
        ...attrs,
      });
    }
      break;
    case "Text": {
      shape = new Konva.Text({
        text: "",
        x: x,
        y: y - 50,
        fill: option.color,
        fontSize: 50,
        padding: 10,
        draggable: true,
        lineHeight: 1.2,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        stroke: antiColor(option.color),
        strokeWidth: option.trace ? 1 : 0,
        fontStyle: (option.italic ? "italic " : "") + (option.bold ? "bold " : ""),
        ...attrs,
        name: "Text",
      });
    }
      break;
    case "Mosaic": {
      shape = new Konva.Rect({
        x: x,
        y: y,
        width: 1,
        height: 1,
        fillPatternRepeat: "no-repeat",
        fillPatternOffsetX: x,
        fillPatternOffsetY: y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        draggable: true,
        ...attrs,
        name: "Mosaic",
      });
    }
      break;
    case "MosaicBrush": {
      shape = new MosaicBrush({
        points: [x, y],
        fillWidth: option.strokeWidth,
        fillPatternRepeat: "no-repeat",
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        ...attrs,
        name: "MosaicBrush",
        hitFunc: (con, shape) => { },
      });
    }
      break;
    case "CutRect": {
      shape = new Konva.Rect({
        x,
        y,
        width: 0,
        height: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        fill: "#fff",
        draggable: true,
        strokeWidth: 0,
        globalCompositeOperation: "destination-out",
        ...attrs,
        name: "CutRect"
      });
    }
      break;
  }

  if (shape && !["Mosaic", "MosaicBrush"].includes(type)) {
    const _shape = shape;
    let attrs: any;
    _shape.on("mousedown", (event) => {
      attrs = _.clone(event.target.getAttrs());
      event.cancelBubble = true;

      if (["Text"].includes(shape.name())) {
        shape.setZIndex(boardLayer.children.length - 1);
        createTransformer(shape);
        option.color = _shape.fill();
      } else {
        option.color = _shape.stroke();
      }
    });

    _shape.on("transformstart", (event) => {
      attrs = _.clone(event.target.getAttrs());
    });


    _shape.on("transformend", (event) => {
      if (attrs && !_.isEqual(attrs, event.target.getAttrs())) {
        pushUndoHistory();
        attrs = null;
      }
    });


    _shape.on("mouseup", (event) => {
      if (attrs && !_.isEqual(attrs, event.target.getAttrs())) {
        pushUndoHistory();
        attrs = null;
      }
    });

  }

  if (type == "Mosaic") {
    shape.on("xChange", (event) => {
      shape.setAttr("fillPatternOffsetX", shape.x());
    });

    shape.on("yChange", (event) => {
      shape.setAttr("fillPatternOffsetY", shape.y());
    });

    shape.on("rotationChange", (event) => {
      shape.setAttr("fillPatternRotation", -shape.rotation());
    });

    shape.on("scaleXChange scaleYChange", (event) => {
      const attrs = shape.getAttrs();
      shape.setAttrs({
        scaleX: 1,
        scaleY: 1,
        width: attrs.width * attrs.scaleX,
        height: attrs.height * attrs.scaleY,
      });
    });
  }

  if (type == "CutRect") {
    shape.on("scaleXChange scaleYChange", (event) => {
      const attrs = shape.getAttrs();
      shape.setAttrs({
        scaleX: 1,
        scaleY: 1,
        width: attrs.width * attrs.scaleX,
        height: attrs.height * attrs.scaleY,
      });
    });
  }

  if (type == "Text") {
    shape.on("dblclick", function (event) {
      if (this.isVisible()) {
        removeTransformer();
        textCloseEditFunc = editText(this as Konva.Text);
      }
    });
    shape.on("textChange", (event) => {
      pushUndoHistory();
    });
  }
  return shape;
}


const toggleVisible = function () {
  if (boardLayer.isVisible()) {
    boardLayer.hide();
  } else {
    boardLayer.show();
  }
}

function computedMosaic(pixelSize = 8) {
  mosaicCanvas.width = drawboard.width();
  mosaicCanvas.height = drawboard.height();
  const ctx = mosaicCanvas.getContext("2d");
  const boardCtx = drawboard.toCanvas().getContext("2d");
  ctx.clearRect(0, 0, mosaicCanvas.width, mosaicCanvas.height);

  const imageData = boardCtx.getImageData(0, 0, mosaicCanvas.width, mosaicCanvas.height);

  Konva.Filters.Pixelate.call({
    pixelSize: () => pixelSize
  }, imageData);

  ctx.putImageData(imageData, 0, 0);
}

function loadBackgroundImage(image: HTMLImageElement) {
  if (!backgroundImage) {
    backgroundImage = new Konva.Image({
      image,
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      scaleX: 1,
      scaleY: 1,
      hitFunc: (ctx, shape) => { }
    });
    backgroundLayer.add(backgroundImage);
  }
  backgroundImage.setAttr("image", image);
}


onMounted(() => {

  drawboard = new Konva.Stage({
    container: "drawboard",
    width: window.innerWidth,
    height: window.innerHeight,
  });

  drawboard.add(backgroundLayer);
  drawboard.add(boardLayer);
  drawboard.add(cutLayer);


  let mx = 0, my = 0;
  let x = 0;
  let y = 0;

  drawboard.on("mousedown", (event) => {
    if (textCloseEditFunc && textCloseEditFunc()) {
      textCloseEditFunc = undefined;
      return;
    }

    if (event.target !== drawboard || event.evt.buttons != 1) return;


    x = event.evt.x;
    y = event.evt.y;
    down = true;

    if (isSelectRect.value) {
      if (transformer && transformer.nodes()[0].name() == "CutRect") {
        isSelectRect.value = false;
        removeTransformer();
        return;
      }
      shapeObject = createShape("CutRect", { x, y });
      cutLayer.add(shapeObject);
      return;
    }

    removeTransformer();


    if (["None"].includes(shape.value)) return;


    shapeObject = createShape(shape.value, { x, y }, {
      id: Math.random().toString(32)
    });

    if (["Mosaic", "MosaicBrush"].includes(shape.value)) {
      if (!["Mosaic", "MosaicBrush"].includes(oldShapeType)) computedMosaic();
      shapeObject.setAttr("fillPatternImage", mosaicCanvas);
    }
    if (shapeObject) {
      boardLayer.add(shapeObject);
    }
    oldShapeType = shape.value;
  });

  drawboard.on("mousemove", (event) => {

    const isShift = event.evt.shiftKey;

    move = down;

    mx = event.evt.x;
    my = event.evt.y;
    const name = shapeObject ? shapeObject.name() : "None";

    if (name == "CutRect") {
      const x1 = -(x - event.evt.x);
      const y1 = -(y - event.evt.y);
      shapeObject.width(x1);
      shapeObject.height(y1);
    }

    if (name == "Rect") {
      const x1 = -(x - event.evt.x);
      const y1 = -(y - event.evt.y);
      if (isShift) {
        const m = Math.abs(y1) > Math.abs(x1) ? y1 : x1;
        shapeObject.width(m);
        shapeObject.height(m);
      } else {
        shapeObject.width(x1);
        shapeObject.height(y1);
      }

    }

    if (name == "Circle") {
      let x1 = event.evt.x;
      let y1 = event.evt.y;
      shapeObject.setAttr("radius", (Math.max(Math.abs(x1 - x), Math.abs(y1 - y))));
    }

    if (name == "Ellipse") {
      let x1 = event.evt.x;
      let y1 = event.evt.y;
      let x2 = x + ((x1 - x) / 2);
      let y2 = y + ((y1 - y) / 2);
      shapeObject.x(x2);
      shapeObject.y(y2);
      shapeObject.setAttrs({
        radiusX: Math.abs((x1 - x) / 2),
        radiusY: Math.abs((y1 - y) / 2)
      });
    }

    if (name == "Triangle") {
      if (isShift) {
        let m = Math.abs(mx - x) > Math.abs(my - y) ? mx - x : my - y;
        shapeObject.setAttr("points", [x, y, x - m, my + m, x + m, my + m]);
      } else {
        shapeObject.setAttr("points", [x, y, x - (mx - x), my, mx, my]);
      }
    }

    if (["Line", "Arrow", "Arrow2"].includes(name)) {
      let x2 = (mx - x);
      let y2 = (my - y);
      if (isShift) {
        const newPoint = calculateNearestPoint({ x: mx, y: my }, { x, y });
        shapeObject.setAttr("points", [0, 0, newPoint.x - x, newPoint.y - y]);
      } else {
        shapeObject.setAttr("points", [0, 0, x2, y2]);

      }
    }



    if (name == "Brush") {
      shapeObject.setAttr("points", shapeObject.getAttr("points").concat([event.evt.x, event.evt.y]));

    }

    if (name == "Eraser") {
      shapeObject.setAttr("points", shapeObject.getAttr("points").concat([event.evt.x, event.evt.y]));
    }

    if (name == "Mosaic") {
      shapeObject.width(-(x - event.evt.x));
      shapeObject.height(-(y - event.evt.y));
    }

    if (name == "MosaicBrush") {
      shapeObject.setAttr("points", shapeObject.getAttr("points").concat([event.evt.x, event.evt.y]));
    }

  });



  drawboard.on("mouseup", (event) => {

    if (move) {
      if (shapeObject && ["CutRect", "Rect", "Circle", "Ellipse", "Triangle", "Arrow", "Arrow2"].includes(shapeObject.name())) {
        let x = shapeObject.x();
        let y = shapeObject.y();
        let width = shapeObject.width();
        let height = shapeObject.height();
        if (width < 0) {
          x += width;
          width = Math.abs(width);
        }
        if (height < 0) {
          y += height;
          height = Math.abs(height);
        }
        shapeObject.setAttrs({ x, y, width, height });
      }



      if (shapeObject && !["Text", "CutRect"].includes(shapeObject.name())) {
        pushUndoHistory();
      }

    } else if (shapeObject) {
      if (shapeObject.name() == "Text") {
        textCloseEditFunc = editText(shapeObject as Konva.Text);
      } else {
        shapeObject.destroy();
        shapeObject = undefined;
      }
    }

    if (shapeObject && !["Text", "CutRect"].includes(shapeObject.name())) {
      createTransformer(shapeObject);
    } else if (shapeObject && shapeObject.name() == "CutRect") {
      transformer = new Konva.Transformer({
        ignoreStroke: true,
        rotateEnabled: false,
        keepRatio: false,
        boundBoxFunc: (oldBox, newBox) => {
          const size = drawboard.getSize();

          if (newBox.x + newBox.width > size.width)
            newBox.width -= newBox.x + newBox.width - size.width;
          if (newBox.y + newBox.height > size.height)
            newBox.height -= newBox.y + newBox.height - size.height;

          if (newBox.x < 0 || newBox.y < 0) return oldBox;
          if (newBox.width == 0) newBox.width = 1;
          if (newBox.height == 0) newBox.height = 1;
          return newBox;
        },
      });
      transformer.nodes([shapeObject]);
      cutLayer.add(transformer);
    }

    down = false;
    move = false;
    shapeObject = undefined;
  });

  window.addEventListener("resize", () => {
    drawboard.width(window.innerWidth);
    drawboard.height(window.innerHeight);
  });


  window.addEventListener("wheel", (event) => {
    const deltaY = event.shiftKey ? event.deltaX : event.deltaY;
    if (deltaY > 0 && option.strokeWidth + 1 <= 50) {
      option.strokeWidth++;
    } else if (deltaY < 0 && option.strokeWidth - 1 >= 2) {
      option.strokeWidth--;
    }
  });

});


const solveSimultaneousEquations = (a: number, b: number, c: number, d: number, e: number, f: number) => {
  // Solve system of equations ax + by = e and cx + dy = f
  const det = ((a) * (d) - (b) * (c))
  const x = ((d) * (e) - (b) * (f)) / det
  const y = ((a) * (f) - (c) * (e)) / det
  return { x, y }
}

const getProjectionFromPointToLine = (point: Konva.Vector2d, line: number[]) => {
  // Get projection from point (x, y) to a line ax + by + c = 0
  const projection = solveSimultaneousEquations(line[0], line[1], -line[1], line[0], -line[2], line[0] * point.y - line[1] * point.x)
  return projection
}


const getDistanceFromPointToLine = (point: Konva.Vector2d, line: number[]) => {
  return Math.abs(line[0] * point.x + line[1] * point.y + line[2]) / Math.sqrt(line[0] * line[0] + line[1] * line[1])
}

const getClosestLine = (currentPoint: Konva.Vector2d, lastPoint: Konva.Vector2d) => {
  // 4 base line in plane, horizontal, vertical, 45 degree, 135 degree
  // each line formulation ax + by + c = 0 -> [a, b, c]
  const lineList = [
    [1, 1, -1 * (lastPoint.x + lastPoint.y)],
    [1, -1, -1 * (lastPoint.x - lastPoint.y)],
    [1, 0, -lastPoint.x],
    [0, 1, -lastPoint.y],
  ]

  const distance = lineList.map(line => getDistanceFromPointToLine(currentPoint, line))
  const maxDistance = Math.min(...distance)
  const maxIndex = distance.indexOf(maxDistance)
  return lineList[maxIndex]
}

const calculateNearestPoint = (currentPoint: Konva.Vector2d, lastPoint: Konva.Vector2d) => {
  const nearestLine = getClosestLine(currentPoint, lastPoint)
  let result = getProjectionFromPointToLine(currentPoint, nearestLine)
  return result
}


const colorChange = function () {
  if (transformer && transformer.nodes().length > 0) {
    pushUndoHistory();
  }
}


const switchShape = function (item: string) {
  if (shape.value != item) {
    shape.value = item;
    removeTransformer();
  }
}



const startSelectRect = function () {
  isSelectRect.value = true;
  shape.value = "none";
  removeTransformer();
  cutLayer.destroyChildren();
  cutLayer.add(new Konva.Rect({
    x: 0,
    y: 0,
    width: drawboard.width(),
    height: drawboard.height(),
    fill: "#00000060",
    hitFunc: (con, shape) => { },
  }));
}

const clearSelectRect = function () {
  cutLayer.destroyChildren();
}

function hexToRgb(hex: string) {
  hex = hex.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return [r, g, b];
}


function antiColor(color: string) {
  const rgb = hexToRgb(color);
  // 亮度值 = (0.299 * 红色值) + (0.587 * 绿色值) + (0.114 * 蓝色值)
  const light = (0.299 * rgb[0]) + (0.587 * rgb[1]) + (0.114 * rgb[2]);
  return light > 127.5 ? "#000000" : "#ffffff"
}

watch(() => option.color, (value) => {
  if (transformer && transformer.nodes().length > 0) {
    transformer.nodes().forEach((shape) => {
      if (["Arrow", "Arrow2"].includes(shape.name())) {
        shape.setAttrs({
          fill: value,
          stroke: value
        });
      } else if (shape.getAttr("name") == "Text") {
        shape.setAttrs({
          stroke: antiColor(value),
          fill: value
        });
      } else {
        shape.setAttr("stroke", value);
      }
    });
  }
});

watch(() => option.strokeWidth, (value) => {

  const shape = shapeObject || (transformer && transformer.nodes()[0]);

  if (shape) {
    if (shape.name() == "Arrow2") {
      shape.setAttr("arrowWidth", value);
    } else if (shape.name() == "Arrow") {
      shape.setAttrs({
        pointerLength: value,
        pointerWidth: value,
        strokeWidth: value
      });
    } else if (shape.name() == "MosaicBrush") {
      shape.setAttr("fillWidth", value);
    } else if (shape.name() == "Text") {
      shape.setAttr("fontSize", value);
    } else {
      shape.setAttr("strokeWidth", value);
    }
  }

});

watch(() => [option.bold, option.italic, option.trace], (value) => {
  const shape = shapeObject || (transformer && transformer.nodes()[0]);
  if (shape && shape.name() == "Text") {
    shape.setAttrs({
      fontStyle: (option.italic ? "italic " : "") + (option.bold ? "bold " : ""),
      strokeWidth: option.trace ? 1 : 0,
    });
    if (transformer) (transformer as any).forceUpdate();
  }
});

const outputJSON = function () {
  console.log(drawboard.toJSON());
}



function handleImageChange(inputEvent: any) {
  const reader = new FileReader();
  reader.onload = function (event) {
    if (event.target && event.target.result) {
      const image = new Image();
      image.src = event.target.result as string;
      image.onload = function () {
        loadBackgroundImage(image);
      }
    }
    if (inputEvent.target.value) {
      inputEvent.target.value = "";
    }
  }
  reader.readAsDataURL(inputEvent.target.files[0]);
}



</script>

<template>
  <div class="draw" id="drawboard"></div>
  <div class="option-box" v-show="!isSelectRect">
    <div class="history">
      <p>
        <span>undo length: {{ undoHistory.length }}</span>
        <span>redo length: {{ redoHistory.length }}</span>
      </p>
      <span>undo:</span>
      <ul>
        <li v-for="item, index in undoHistory" @click="console.log(item)">
          [{{ index }},{{ item.length }}]
        </li>
      </ul>
      <span>redo:</span>
      <ul>
        <li v-for="item, index in redoHistory" @click="console.log(item)">
          [{{ index }},{{ item.length }}]
        </li>
      </ul>
    </div>
    <div class="edit">
      <button @click="undo">撤销</button>
      <button @click="redo">重做</button>
      <button @click="clearCanvas">清空画板</button>
      <button @click="toggleVisible">隐藏/显示</button>
      <button @click="outputJSON">打印json</button>
      <button>
        <label for="image-file">
          设置封面
          <input id="image-file" type="file" accept="image/*" @change="handleImageChange" style="display: none" />
        </label>
      </button>
    </div>
    <div class="shape">
      <div>
        <span>颜色:</span>
        <input type="color" @change="colorChange" v-model="option.color">
        <span>大小:</span>
        <input type="number" max="50" min="2" v-model="option.strokeWidth">
      </div>
    </div>
    <div class="shape-list">
      <button :class="{ acitve: shape == item }" v-for="item, index of shapes" @click="switchShape(item)">
        {{ item }}
      </button>
    </div>
    <div class="func-box">
      <label for="fill">
        <input type="checkbox" id="fill" v-model="option.fill">
        <span>填充</span>
      </label>
      <label for="bold">
        <input type="checkbox" id="bold" v-model="option.bold">
        <span>粗体</span>
      </label>
      <label for="italic">
        <input type="checkbox" id="italic" v-model="option.italic">
        <span>斜体</span>
      </label>
      <label for="trace">
        <input type="checkbox" id="trace" v-model="option.trace">
        <span>描边</span>
      </label>
      <button @click="toggleHit">切换Hit</button>
      <button @click="startSelectRect">裁切矩形</button>
      <button @click="clearSelectRect">清除裁切矩形</button>
      <button @click="downloadImage">保存结果</button>
    </div>
  </div>
</template>

<style>
* {
  padding: 0;
  margin: 0;
}

#background {
  background: url(/screenshot.png);
  background-size: calc(100vw * 1.5) calc(100vh * 1.5);
}

.draw {
  position: fixed;
  left: 0;
  top: 0;
}


.option-box {
  position: fixed;
  padding: 10px;
  left: 0;
  bottom: 0;
  border-top-right-radius: 5px;
  background-color: rgb(45, 41, 48);
  color: white;
  user-select: none;
  box-shadow: 2px -2px 5px #fff3;
}

.shape-list {
  height: 40px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  box-sizing: content-box;
  margin-bottom: 5px;
}

.shape-list button {
  padding: 5px;
  outline: none;
  border: 2px solid transparent;
  background-color: rgb(148, 248, 251);
  margin-right: 6px;
}

.shape-list button:hover {
  transform: scale(1.1);
}

.shape-list button.acitve {
  border: 2px solid rgb(0, 157, 255);
}


.func-box>* {
  margin-right: 5px;
}

.text {
  position: fixed;
  min-width: 100px;
  min-height: 30px;
  left: 100px;
  top: 100px;
  outline: none;
  border: 1px solid rgb(0, 157, 255);
  border-radius: 5px;
  padding: 5px;
  resize: none;
}


.shape {
  margin-top: 10px;
}

.shape button,
.edit button {
  margin-left: 5px;
}

.history span {
  margin-right: 5px;
}

.history ul {
  max-width: 100vw;
  list-style-type: none;
  display: flex;
  overflow-y: auto;
  align-items: center;
}

.history li {
  padding: 3px;
}

.history li.active {
  color: red;
}

.shape div {
  display: flex;
  align-items: center;
}

.shape input {
  width: 40px;
  height: 20px;
}
</style>
