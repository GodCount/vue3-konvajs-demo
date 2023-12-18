<script setup lang="ts">
import { reactive, computed, ref, onMounted, watch } from 'vue';
import Konva from "konva";
import _ from 'lodash-es';

interface Level {
    name: string;
    maxOutOfBoundsCount: number;
    maxUpCount: number;
    limitSecond: number;
    floorAttrs: {
        [key: string]: any;
        points: number[];
        stroke: string;
        strokeWidth: number;
    };
    lineAttrs: {
        strokeWidth: number;
    }
}

interface PlayResult {
    level: Level;
    linePoints: number[];
    status: "loser" | "win";
    time: number;
    outOfBoundsCount: number;
    upCount: number;
    timeCost: number;
}

const config = reactive({
    mode: "none" as "play" | "add" | "modify" | "history" | "none",
    editConfig: {
        name: "",
        stroke: "#ff0000",
        strokeWidth: 10,
        lineStrokeWidth: 6,
        maxOutOfBoundsCount: 4,
        maxUpCount: 2,
        limitSecond: 20
    },
    level: (JSON.parse(window.localStorage.getItem("level")) as Level[]) || [],
    playResult: (JSON.parse(window.localStorage.getItem("playResult")) as PlayResult[]) || [],
    currentLevel: null as Level,
    currentPlayResult: null as PlayResult,
    playInfo: {
        downCount: 0,
        outOfBoundsCount: 0,
        upCount: 0,
        timeout: 0,
        path: null as Path2D,
        singleOutOfBoundsCount: 0,
        startTime: 0,
    }
});

let stage: Konva.Stage;
let layer = new Konva.Layer();
let down = false;
let move = false;
let shapeObject: Konva.Shape;
let downPoint: Konva.Vector2d;
const boundsIfCanvas = document.createElement("canvas");
const boundsIfCtx = boundsIfCanvas.getContext("2d");

boundsIfCanvas.width = window.innerWidth;
boundsIfCanvas.height = window.innerHeight;


onMounted(() => {
    stage = new Konva.Stage({
        container: "drawboard",
        width: window.innerWidth,
        height: window.innerHeight,
    });
    stage.add(layer);


    stage.on("mousedown touchstart", (event) => {
        downPoint = stage.getPointerPosition();
        down = true;

        if (config.mode == "add") {
            shapeObject = new Konva.Line({
                points: [downPoint.x, downPoint.y],
                stroke: config.editConfig.stroke,
                strokeWidth: config.editConfig.strokeWidth,
                lineCap: 'round',
                lineJoin: 'round',
                shadowColor: "white",
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 2,
                hitFunc(con, shape) { },
            });
            layer.add(shapeObject);
        } else if (config.mode == "play" && config.currentLevel) {
            if (!shapeObject) {
                const points = config.currentLevel.floorAttrs.points;
                const x = Math.abs(downPoint.x - points[0]);
                const y = Math.abs(downPoint.y - points[1]);
                if (x > config.currentLevel.floorAttrs.strokeWidth || y > config.currentLevel.floorAttrs.strokeWidth) {
                    return alert("没在起点开始!");
                }
                shapeObject = new Konva.Line({
                    points: [downPoint.x, downPoint.y],
                    stroke: config.currentLevel.floorAttrs.stroke,
                    strokeWidth: config.currentLevel.lineAttrs.strokeWidth,
                    globalCompositeOperation: "destination-out",
                    lineCap: 'round',
                    lineJoin: 'round',
                    hitFunc(con, shape) { },
                });
                layer.add(shapeObject);
                config.playInfo.startTime = Date.now();
            } else {
                const point = shapeObject.getAttr("points") as number[];
                const x = Math.abs(point[point.length - 2] - downPoint.x);
                const y = Math.abs(point[point.length - 1] - downPoint.y);
                if (x < config.currentLevel.floorAttrs.strokeWidth && y < config.currentLevel.floorAttrs.strokeWidth) {
                    shapeObject.setAttr("points", shapeObject.getAttr("points").concat([downPoint.x, downPoint.y]));
                } else {
                    config.playInfo.upCount++;
                    return window.alert("需要在末端继续!");
                }
            }
            startTineing();
        }

    });

    stage.on("mousemove touchmove", (event) => {
        if (down) {
            if (shapeObject) {
                if (config.mode == "add") {
                    shapeObject.setAttr("points", shapeObject.getAttr("points").concat([event.evt.x, event.evt.y]));
                } else if (config.mode == "play") {
                    if (!isPointInPath(event.evt.x, event.evt.y)) {
                        config.playInfo.singleOutOfBoundsCount++;
                        if (config.playInfo.singleOutOfBoundsCount >= config.currentLevel.floorAttrs.strokeWidth) {
                            config.playInfo.outOfBoundsCount--;
                            config.playInfo.singleOutOfBoundsCount = 0;
                        }
                    } else if (config.playInfo.singleOutOfBoundsCount != 0) {
                        config.playInfo.singleOutOfBoundsCount = 0;
                        config.playInfo.outOfBoundsCount--;
                    }
                    shapeObject.setAttr("points", shapeObject.getAttr("points").concat([event.evt.x, event.evt.y]));

                    resultIf();
                }
            }
        }

    });

    stage.on("mouseup touchend", (event) => {
        if (shapeObject) {
            if (config.mode == "add") {
                config.level.push({
                    name: config.editConfig.name,
                    maxOutOfBoundsCount: config.editConfig.maxOutOfBoundsCount,
                    maxUpCount: config.editConfig.maxUpCount,
                    limitSecond: config.editConfig.limitSecond,
                    floorAttrs: {
                        ...shapeObject.getAttrs(),
                    },
                    lineAttrs: {
                        strokeWidth: config.editConfig.lineStrokeWidth
                    }
                });
                window.localStorage.setItem("level", JSON.stringify(config.level));
                selectLevel(config.level[config.level.length - 1]);
                config.mode = "none";
                shapeObject = undefined;
            } else if (config.mode == "play") {
                clearInterval(config.playInfo.timeout);
                config.playInfo.upCount--;
                resultIf();
            }
        }
        down = false;
    });


    window.addEventListener("resize", () => {
        stage.width(window.innerWidth);
        stage.height(window.innerHeight);
        boundsIfCanvas.width = window.innerWidth;
        boundsIfCanvas.height = window.innerHeight;
    });
});



function selectLevel(level: Level) {
    config.currentLevel = level;
    config.currentPlayResult = null;
    layer.destroyChildren();
    config.playInfo.downCount = level.limitSecond;
    config.playInfo.outOfBoundsCount = level.maxOutOfBoundsCount;
    config.playInfo.upCount = level.maxUpCount;
    config.playInfo.singleOutOfBoundsCount = 0;
    layer.add(new Konva.Line(level.floorAttrs));
    syncBoundsIfCanvas();
}

function syncBoundsIfCanvas() {
    if (config.currentLevel) {
        boundsIfCtx.clearRect(0, 0, boundsIfCanvas.width, boundsIfCanvas.height);
        const path = new Path2D();
        const points = config.currentLevel.floorAttrs.points;
        path.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
            path.lineTo(points[i], points[i + 1]);
        }
        boundsIfCtx.strokeStyle = config.currentLevel.floorAttrs.stroke;
        boundsIfCtx.lineWidth = config.currentLevel.floorAttrs.strokeWidth;
        boundsIfCtx.lineCap = "round";
        boundsIfCtx.lineJoin = "round";
        boundsIfCtx.fill(path);
        config.playInfo.path = path;
    }
}

function isPointInPath(x: number, y: number) {
    if (config.playInfo.path) {
        const offset = config.currentLevel.lineAttrs.strokeWidth / 2;
        return boundsIfCtx.isPointInStroke(config.playInfo.path, x, y);
    }
    return false;
}


function startTineing() {
    config.playInfo.timeout = setInterval(() => {
        config.playInfo.downCount--;
        if (config.playInfo.downCount == 0) {
            resultIf();
            clearInterval(config.playInfo.timeout);
        }
    }, 1000);
}


function play() {
    if (config.mode == "play") return;
    if (!config.currentLevel) return window.alert("没有选择关卡!");
    config.mode = "play";
}



function resultIf() {
    if (config.playInfo.downCount == 0 ||
        config.playInfo.outOfBoundsCount == 0 ||
        config.playInfo.upCount == 0) {
        config.playResult.push({
            level: _.cloneDeep(config.currentLevel),
            linePoints: shapeObject.getAttr("points"),
            status: "loser",
            time: config.playInfo.startTime,
            timeCost: config.currentLevel.limitSecond - config.playInfo.downCount,
            outOfBoundsCount: config.playInfo.outOfBoundsCount,
            upCount: config.playInfo.upCount,
        });
        shapeObject = undefined;
        config.mode = "none";
        clearInterval(config.playInfo.timeout);
        window.localStorage.setItem("playResult", JSON.stringify(config.playResult));
        alertResult(config.playResult[config.playResult.length - 1]);
    } else {
        let points = shapeObject.getAttr("points") as number[];
        const lastLinePoint = [points[points.length - 2], points[points.length - 1]];
        points = config.currentLevel.floorAttrs.points;
        const lastFloorPoint = [points[points.length - 2], points[points.length - 1]];
        const x = Math.abs(lastLinePoint[0] - lastFloorPoint[0]);
        const y = Math.abs(lastLinePoint[1] - lastFloorPoint[1]);
        if (x < config.currentLevel.floorAttrs.strokeWidth && y < config.currentLevel.floorAttrs.strokeWidth) {
            config.playResult.push({
                level: _.cloneDeep(config.currentLevel),
                linePoints: shapeObject.getAttr("points"),
                status: "win",
                time: config.playInfo.startTime,
                timeCost: config.currentLevel.limitSecond - config.playInfo.downCount,
                outOfBoundsCount: config.playInfo.outOfBoundsCount,
                upCount: config.playInfo.upCount,
            });
            shapeObject = undefined;
            config.mode = "none";
            clearInterval(config.playInfo.timeout);
            window.localStorage.setItem("playResult", JSON.stringify(config.playResult));
            alertResult(config.playResult[config.playResult.length - 1]);
        }
    }
}


function addLevel() {
    if (!config.editConfig.name || config.level.find((item) => item.name == config.editConfig.name)) {
        return window.alert("名称是空的或者已存在!");
    }
    config.mode = "add";
    layer.destroyChildren();
}

function modifLevel() {
    if (config.currentLevel && config.mode != "modify") {
        config.mode = "modify";
        config.editConfig.name = config.currentLevel.name;
        config.editConfig.limitSecond = config.currentLevel.limitSecond;
        config.editConfig.lineStrokeWidth = config.currentLevel.lineAttrs.strokeWidth;
        config.editConfig.maxOutOfBoundsCount = config.currentLevel.maxOutOfBoundsCount;
        config.editConfig.maxUpCount = config.currentLevel.maxUpCount;
        config.editConfig.stroke = config.currentLevel.floorAttrs.stroke;
        config.editConfig.strokeWidth = config.currentLevel.floorAttrs.strokeWidth;
    } else if (config.mode == "modify") {
        config.mode = "none";
        config.currentLevel.name = config.editConfig.name;
        config.currentLevel.limitSecond = config.editConfig.limitSecond;
        config.currentLevel.lineAttrs.strokeWidth = config.editConfig.lineStrokeWidth;
        config.currentLevel.maxOutOfBoundsCount = config.editConfig.maxOutOfBoundsCount;
        config.currentLevel.maxUpCount = config.editConfig.maxUpCount;
        config.currentLevel.floorAttrs.stroke = config.editConfig.stroke;
        config.currentLevel.floorAttrs.strokeWidth = config.editConfig.strokeWidth;
        window.localStorage.setItem("level", JSON.stringify(config.level));
    }
}

function alertResult(result: PlayResult) {
    config.mode = "history";
    config.currentLevel = null;
    config.currentPlayResult = result;
    layer.destroyChildren();
    layer.add(new Konva.Line(result.level.floorAttrs));
    layer.add(new Konva.Line({
        points: result.linePoints,
        stroke: result.level.floorAttrs.stroke,
        strokeWidth: result.level.lineAttrs.strokeWidth,
        globalCompositeOperation: "destination-out",
        lineCap: 'round',
        lineJoin: 'round',
        hitFunc(con, shape) { },
    }));
}


watch(config.editConfig, (config) => {
    if (config.strokeWidth - 2 < config.lineStrokeWidth) {
        config.lineStrokeWidth = config.strokeWidth - 2;
    }
});


</script>

<template>
    <div class="main">
        <div class="draw" id="drawboard"></div>
        <div class="option">
            <div class="ctrl">
                <button :class="{ active: config.mode == 'play' }" @click="play">开始</button>
                <button :class="{ active: config.mode == 'add' }" @click="addLevel">添加关卡</button>
                <button :class="{ active: config.mode == 'modify' }" @click="modifLevel">
                {{ config.mode == "modify" ? "确认修改" : "修改" }}
                    </button>
            </div>
            <div class="level">
                <span>关卡:</span>
                <div>
                    <button :class="{ active: config.currentLevel && config.currentLevel.name == item.name }"
                        v-for="item in config.level" @click="selectLevel(item)">{{ item.name }}</button>
                </div>
            </div>
            <div class="playResult">
                <span>历史:</span>
                <div>
                    <button :class="[item.status]" v-for="item in config.playResult" @click="alertResult(item)">{{
                        item.level.name }}</button>
                </div>
            </div>
            <div class="add">
                <span>关卡名称:</span>
                <input type="text" v-model="config.editConfig.name">
                <span>最大出界次数:</span>
                <input type="number" max="10" min="0" v-model="config.editConfig.maxOutOfBoundsCount">
                <span>最大提起次数:</span>
                <input type="number" max="10" min="0" v-model="config.editConfig.maxUpCount">
                <span>限时(Sec.):</span>
                <input type="number" min="5" v-model="config.editConfig.limitSecond">
                <span>地板宽度:</span>
                <input type="number" max="50" min="5" v-model="config.editConfig.strokeWidth">
                <span>地板颜色:</span>
                <input type="color" v-model="config.editConfig.stroke">
                <span>线宽度:</span>
                <input type="number" max="48" min="1" v-model="config.editConfig.lineStrokeWidth">
            </div>
        </div>
        <div class="info">
            <template v-if="config.mode == 'history' && config.currentPlayResult">
                <p>关卡:<strong>{{ config.currentPlayResult.level.name }}</strong></p>
                <p>结果:<strong>{{ config.currentPlayResult.status }}</strong></p>
                <p>用时:<strong>
                        {{ config.currentPlayResult.timeCost }} / {{
                            config.currentPlayResult.level.limitSecond }}
                    </strong></p>
                <p>出界:<strong>
                        {{ config.currentPlayResult.outOfBoundsCount }} / {{
                            config.currentPlayResult.level.maxOutOfBoundsCount }}
                    </strong></p>
                <p>提起:<strong>
                        {{ config.currentPlayResult.upCount }} / {{
                            config.currentPlayResult.level.maxUpCount }}
                    </strong></p>
            </template>
            <template v-else>
                <p>关卡:<strong>{{ config.currentLevel ? config.currentLevel.name : "空" }}</strong></p>
                <p>倒计时:<strong>{{ config.playInfo.downCount }}</strong></p>
                <p>剩余出界:<strong>{{ config.playInfo.outOfBoundsCount }}</strong></p>
                <p>单次出界计数:<strong>{{ config.playInfo.singleOutOfBoundsCount }}</strong></p>
                <p>剩余提起:<strong>{{ config.playInfo.upCount }}</strong></p>
            </template>

        </div>
    </div>
</template>

<style>
* {
    padding: 0;
    margin: 0;
}

body {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
}

.main {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: flex-start;
    align-items: center;
}

.draw {
    background: #cccccc;
}

.option {
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

.add {
    display: flex;
    align-items: center;
}

.add>*+* {
    margin-right: 5px;
}

.add input {
    width: 40px;
    height: 20px;
}

.ctrl,
.playResult,
.level {
    display: flex;
    align-items: center;
}

.playResult div,
.level div {
    max-width: 100vw;
    overflow-y: auto;
}

button+button {
    margin-left: 5px;
}

button.active {
    border: 1px solid red;
}

button.win {
    color: green;
}

button.loser {
    color: red;
}

.info {
    position: fixed;
    left: 10px;
    top: 10px;
    pointer-events: none;
    opacity: .6;
    color: black;
}

.info strong {
    margin-left: 5px;
}
</style>
