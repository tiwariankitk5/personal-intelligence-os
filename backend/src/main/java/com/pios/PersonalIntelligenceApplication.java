package com.pios;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PersonalIntelligenceApplication {
    public static void main(String[] args) {
        SpringApplication.run(PersonalIntelligenceApplication.class, args);
    }
}
