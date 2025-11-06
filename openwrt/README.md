# OpenWRT Package Configuration

This directory contains the configuration files needed to build QuecManager-JS as an OpenWRT IPK package.

## Structure

```
openwrt/
├── Makefile                        # OpenWRT package build script
└── files/
    ├── quecmanager.init           # procd init script
    ├── quecmanager.config         # UCI configuration file
    └── uhttpd-quecmanager         # uhttpd configuration
```

## Building the IPK

### Automated Build (GitHub Actions)

The easiest way to build IPK packages is through GitHub Actions:

1. Push code to GitHub (main, development, or claude/* branches)
2. GitHub Actions automatically builds IPKs for all architectures
3. Download IPK artifacts from the Actions tab
4. For releases: Tag with `v*` (e.g., `v0.1.0`) to create a GitHub Release

### Manual Build (Local)

If you want to build locally:

1. **Download OpenWRT SDK**:
   ```bash
   wget https://downloads.openwrt.org/releases/23.05.3/targets/ipq40xx/generic/openwrt-sdk-23.05.3-ipq40xx-generic.Linux-x86_64.tar.xz
   tar -xJf openwrt-sdk-*.tar.xz
   cd openwrt-sdk-*
   ```

2. **Copy package files**:
   ```bash
   mkdir -p package/quecmanager-js
   cp -r /path/to/QuecManager-JS/openwrt/* package/quecmanager-js/
   rsync -av --exclude='node_modules' --exclude='.next' \
     /path/to/QuecManager-JS/ package/quecmanager-js/src/
   ```

3. **Update feeds**:
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install -a
   ```

4. **Configure**:
   ```bash
   make menuconfig
   # Navigate to: Network -> quecmanager-js -> Select as module (M)
   # Save and exit
   ```

5. **Build**:
   ```bash
   make package/quecmanager-js/compile V=s
   ```

6. **Find IPK**:
   ```bash
   find bin/packages -name "quecmanager-js*.ipk"
   ```

## Installation on OpenWRT

### Prerequisites

Your OpenWRT device needs:
- Node.js runtime: `opkg install node node-npm`
- uhttpd web server: `opkg install uhttpd uhttpd-mod-ubus`
- At least 50MB free storage

### Install IPK

1. **Copy IPK to router**:
   ```bash
   scp quecmanager-js_0.1.0-1_aarch64_cortex-a53.ipk root@192.168.1.1:/tmp/
   ```

2. **Install**:
   ```bash
   ssh root@192.168.1.1
   opkg install /tmp/quecmanager-js_*.ipk
   ```

3. **Access**:
   - Open browser: `http://192.168.1.1:3000`
   - Default login: `root` / (router password)

### Service Management

```bash
# Start service
/etc/init.d/quecmanager start

# Stop service
/etc/init.d/quecmanager stop

# Restart service
/etc/init.d/quecmanager restart

# Enable on boot
/etc/init.d/quecmanager enable

# Disable on boot
/etc/init.d/quecmanager disable

# Check status
ps | grep "next start"
netstat -tunlp | grep 3000
```

### Configuration

Edit `/etc/config/quecmanager`:

```bash
uci set quecmanager.config.enabled='1'
uci set quecmanager.config.port='3000'
uci set quecmanager.ping.enabled='1'
uci set quecmanager.memory.enabled='1'
uci commit quecmanager
/etc/init.d/quecmanager restart
```

## Supported Architectures

GitHub Actions builds for:

| Architecture | Target Devices |
|--------------|----------------|
| `aarch64_cortex-a53` | Qualcomm SDX55, SDX62, SDX65 (most 5G modems) |
| `arm_cortex-a7` | Older Quectel modems (EC25, etc.) |
| `x86_64` | Development/testing on x86 systems |

## Package Contents

The IPK installs:

- **Next.js app**: `/www/quecmanager/` - Web application
- **CGI scripts**: `/www/cgi-bin/` - Legacy shell scripts
- **Init script**: `/etc/init.d/quecmanager` - Service management
- **Config**: `/etc/config/quecmanager` - UCI configuration
- **uhttpd config**: `/etc/config/uhttpd-quecmanager` - Web server config

## Troubleshooting

### Service won't start

```bash
# Check logs
logread | grep quecmanager

# Check if Node.js is installed
node --version

# Check if port 3000 is available
netstat -tunlp | grep 3000

# Try manual start
cd /www/quecmanager
node node_modules/.bin/next start
```

### Out of memory

```bash
# Check available memory
free -m

# Stop other services to free memory
/etc/init.d/uhttpd stop

# Consider using external storage
opkg update
opkg install block-mount kmod-usb-storage
```

### Build fails

```bash
# Clean build
make package/quecmanager-js/clean
make package/quecmanager-js/compile V=s

# Check SDK version matches OpenWRT version on device
cat /etc/openwrt_release
```

## Development

To modify the package:

1. Edit files in `openwrt/`
2. Test build with GitHub Actions (push to branch)
3. Download and test IPK on device
4. Commit changes

## Version Management

Package version is defined in:
- `openwrt/Makefile`: `PKG_VERSION` and `PKG_RELEASE`
- `package.json`: `version` field

Keep them in sync for consistency.

## License

Same as main project (see root LICENSE file).
