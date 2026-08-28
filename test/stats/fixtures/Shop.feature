Feature: Shop

  Background:
    Given I am logged in as "sebs"

  @smoke
  Scenario: Buying one thing
    Given I have 3 items in my cart
    When I check out
    Then I see 1 order

  Scenario: Buying another thing
    Given I have 7 items in my cart
    And I have a voucher
    When I check out
    Then I see 1 order

  @smok
  Scenario Outline: Paying
    Given I have <count> items in my cart
    When I pay with "<method>"
    Then I see 1 order

    Examples:
      | count | method |
      | 1     | card   |
      | 2     | cash   |
