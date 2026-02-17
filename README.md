# MicroPanel Electron

**Micro Panel** 是一个轻量级的Electron应用，提供跨平台的微面板管理和控制功能。

![License](https://img.shields.io/badge/license-Apache-green.svg)
![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)

## 项目简介

MicroPanel Electron 是一个使用 Electron 框架构建的桌面应用程序，用于提供微服务面板的管理、配置和控制功能。支持跨越 Windows、macOS 和 Linux 平台。

## 主要功能

- **系统信息展示** - 显示CPU、内存、系统版本等设备信息
- **插件管理** - 插件的安装、卸载和管理
- **代码编辑** - 集成代码编辑器，支持多种编程语言
- **登录认证** - 支持用户登录和权限管理
- **配置管理** - 灵活的应用配置界面
- **WebSocket支持** - 实时数据通讯和交互
- **日志系统** - 完整的日志记录和查询功能

## 运行方式
### 运行编译产物（仅限Windows）

从 [Release](../../releases) 下载安装包

### 自主构建

- Node.js 14.0 或更高版本
- npm 或 yarn
- Electron 30.0.0 或更高版本

#### 安装
##### 克隆仓库

```bash
git clone https://github.com/tiancra/MicroPanelElectron.git
cd MicroPanelElectron
```

##### 安装依赖

```bash
npm install
```

#### 运行
##### 启动应用

```bash
npm start
```

##### 启动调试模式
```bash
npm run debug
```

#### 构建

```bash
npm run build
```