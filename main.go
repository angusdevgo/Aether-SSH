package main

import (
	"context"
	"embed"
	"os"
	"syscall"
	"unsafe"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/windows/icon.ico
var icon []byte

// forceShowWindow 多重策略唤醒窗口，解决长时间挂托盘后 WindowShow 失效的问题
// forceShowWindow 唤醒隐藏到托盘的窗口，带 recover 防止 panic 导致托盘 goroutine 挂死
func forceShowWindow(ctx context.Context) {
	defer func() { recover() }()
	runtime.WindowHide(ctx)
	runtime.WindowShow(ctx)
}

func main() {
	// 创建全局互斥锁，确保程序只能运行一个实例 (单例模式)
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	procCreateMutex := kernel32.NewProc("CreateMutexW")
	mutexName, _ := syscall.UTF16PtrFromString("AetherSSH_Global_Single_Instance_Mutex")
	_, _, errMutex := procCreateMutex.Call(0, 1, uintptr(unsafe.Pointer(mutexName)))
	if errMutex == syscall.ERROR_ALREADY_EXISTS {
		// 如果发现已经有一个实例在运行，则当前启动的实例静默退出
		os.Exit(0)
	}

	// Create an instance of the app structure
	app := NewApp()

	// Setup systray
	onReady := func() {
		systray.SetIcon(icon)
		systray.SetTitle("Aether")
		systray.SetTooltip("Aether SSH")

		mShow := systray.AddMenuItem("显示主窗口", "Show Main Window")
		mQuit := systray.AddMenuItem("完全退出", "Quit Aether")

		// Handle left click on the tray icon to show window
		systray.SetOnClick(func(menu systray.IMenu) {
			if app.ctx != nil {
				forceShowWindow(app.ctx)
			}
		})

		mShow.Click(func() {
			if app.ctx != nil {
				forceShowWindow(app.ctx)
			}
		})

		mQuit.Click(func() {
			systray.Quit()
			os.Exit(0)
		})
	}
	onExit := func() {}

	// Run systray in background
	go systray.Run(onReady, onExit)

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "Aether",
		Width:  1440,
		Height: 900,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 8, G: 12, B: 20, A: 255}, // #080c14
		OnStartup:        app.startup,
		// 拦截窗口关闭：隐藏到后台而非退出
		OnBeforeClose: func(ctx context.Context) bool {
			runtime.WindowHide(ctx)
			return true // return true = 取消关闭，由 WindowHide 处理
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              true,
			WindowIsTranslucent:               true,
			DisableWindowIcon:                 false,
			DisableFramelessWindowDecorations: false,
			WebviewUserDataPath:               "",
			ZoomFactor:                        1.0,
			Theme:                             windows.Dark,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
