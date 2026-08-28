@web
Feature: Checkout rules

  Rule: A voucher may be used once

    Background:
      Given I have a voucher

    @smoke
    Scenario: Using it once
      When I check out with:
        | item   | price |
        | cheese | 3.50  |
      Then I see the receipt:
        """
        Total: 3.50
        """
