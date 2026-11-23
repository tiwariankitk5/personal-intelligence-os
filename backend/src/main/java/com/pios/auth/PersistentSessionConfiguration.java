package com.pios.auth;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.session.web.http.SessionRepositoryFilter;

/** Flyway owns the schema; all hosted replicas use the same revocable session store. */
@Configuration(proxyBeanMethods = false)
@Profile("hosted")
@EnableJdbcHttpSession(tableName = "pios_sessions", maxInactiveIntervalInSeconds = 1800)
public class PersistentSessionConfiguration {
    @Bean
    CookieSerializer piosSessionCookieSerializer() {
        var cookie = new DefaultCookieSerializer();
        cookie.setCookieName("JSESSIONID");
        cookie.setCookiePath("/");
        cookie.setUseHttpOnlyCookie(true);
        cookie.setUseSecureCookie(true);
        cookie.setSameSite("Lax");
        cookie.setUseBase64Encoding(false);
        return cookie;
    }

    @Bean
    FilterRegistrationBean<SessionRepositoryFilter<?>> persistentSessionFilterRegistration(SessionRepositoryFilter<?> filter) {
        var registration = new FilterRegistrationBean<SessionRepositoryFilter<?>>(filter);
        registration.setOrder(SessionRepositoryFilter.DEFAULT_ORDER);
        registration.setName("piosPersistentSessions");
        return registration;
    }
}
