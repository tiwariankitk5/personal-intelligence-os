package com.pios.auth;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class AuthAbuseConfiguration {
    @Bean
    Clock authAbuseClock() { return Clock.systemUTC(); }
}
