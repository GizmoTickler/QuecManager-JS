# OpenWRT Makefile for QuecManager-JS
include $(TOPDIR)/rules.mk

PKG_NAME:=quecmanager-js
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)
PKG_BUILD_DEPENDS:=node/host

include $(INCLUDE_DIR)/package.mk

define Package/quecmanager-js
  SECTION:=net
  CATEGORY:=Network
  TITLE:=QuecManager Web Interface (Next.js)
  URL:=https://github.com/GizmoTickler/QuecManager-JS
  DEPENDS:=+node +node-npm +uhttpd
  PKGARCH:=all
endef

define Package/quecmanager-js/description
  Modern web interface for Quectel 5G modems running on OpenWRT.
  Built with Next.js 15, React 19, and TypeScript.
  Provides modem management, network monitoring, and system configuration.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./../../* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	# Install dependencies and build
	cd $(PKG_BUILD_DIR) && \
	pnpm install && \
	pnpm run build

	# Create package structure
	rm -rf $(PKG_BUILD_DIR)/package_root
	mkdir -p $(PKG_BUILD_DIR)/package_root/www

	# Copy built Next.js app
	cp -r $(PKG_BUILD_DIR)/.next $(PKG_BUILD_DIR)/package_root/www/quecmanager
	cp -r $(PKG_BUILD_DIR)/public $(PKG_BUILD_DIR)/package_root/www/quecmanager/public
	cp $(PKG_BUILD_DIR)/package.json $(PKG_BUILD_DIR)/package_root/www/quecmanager/
	cp $(PKG_BUILD_DIR)/next.config.mjs $(PKG_BUILD_DIR)/package_root/www/quecmanager/

	# Install production dependencies only
	cd $(PKG_BUILD_DIR)/package_root/www/quecmanager && \
	pnpm install --prod

	# Copy CGI scripts (legacy support)
	mkdir -p $(PKG_BUILD_DIR)/package_root/www/cgi-bin
	cp -r $(PKG_BUILD_DIR)/scripts/cgi-bin/* $(PKG_BUILD_DIR)/package_root/www/cgi-bin/

	# Make scripts executable
	find $(PKG_BUILD_DIR)/package_root/www/cgi-bin -type f -name "*.sh" -exec chmod +x {} \;
endef

define Package/quecmanager-js/install
	$(INSTALL_DIR) $(1)/www/quecmanager
	$(INSTALL_DIR) $(1)/www/cgi-bin
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config

	# Install Next.js application
	$(CP) $(PKG_BUILD_DIR)/package_root/www/quecmanager/* $(1)/www/quecmanager/

	# Install CGI scripts
	$(CP) $(PKG_BUILD_DIR)/package_root/www/cgi-bin/* $(1)/www/cgi-bin/

	# Install init script
	$(INSTALL_BIN) ./files/quecmanager.init $(1)/etc/init.d/quecmanager

	# Install config file
	$(INSTALL_CONF) ./files/quecmanager.config $(1)/etc/config/quecmanager

	# Install uhttpd config
	$(INSTALL_CONF) ./files/uhttpd-quecmanager $(1)/etc/config/uhttpd-quecmanager
endef

define Package/quecmanager-js/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# Enable and start the service
	/etc/init.d/quecmanager enable
	/etc/init.d/quecmanager start

	# Reload uhttpd
	/etc/init.d/uhttpd reload

	echo "QuecManager-JS installed successfully!"
	echo "Access the web interface at http://router-ip:3000"
}
exit 0
endef

define Package/quecmanager-js/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# Stop and disable the service
	/etc/init.d/quecmanager stop
	/etc/init.d/quecmanager disable
}
exit 0
endef

define Package/quecmanager-js/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# Clean up
	rm -rf /www/quecmanager
	echo "QuecManager-JS removed successfully!"
}
exit 0
endef

$(eval $(call BuildPackage,quecmanager-js))
